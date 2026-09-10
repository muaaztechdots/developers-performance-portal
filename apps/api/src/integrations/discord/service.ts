import bcrypt from "bcryptjs";
import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  type AnyThreadChannel,
  type Message
} from "discord.js";
import { DeveloperSpecialty, ReportSource, UserRole } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { config } from "../../config.js";
import { prisma } from "../../lib/prisma.js";
import { parseDiscordStatus } from "./status-parser.js";

type SyncResult = {
  threadsScanned: number;
  messagesScanned: number;
  reportsImported: number;
  ignoredMessages: number;
  errors: string[];
};

let client: Client | null = null;
let ready = false;
let lastSyncAt: Date | null = null;
let lastSyncResult: SyncResult | null = null;

const qaThreadNames = new Set(
  config.DISCORD_QA_THREAD_NAMES.split(",").map((name) => name.trim().toLocaleLowerCase()).filter(Boolean)
);

function discordIsConfigured() {
  return Boolean(config.DISCORD_BOT_TOKEN && config.DISCORD_GUILD_ID && config.DISCORD_STATUS_CHANNEL_ID);
}

function splitName(threadName: string) {
  const parts = threadName.trim().replace(/\s+/g, " ").split(" ");
  return { firstName: parts.shift() || "Discord", lastName: parts.join(" ") };
}

function placeholderEmail(threadName: string, threadId: string) {
  const slug = threadName.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "") || "developer";
  return `${slug}.${threadId}@discord.local`;
}

async function resolveDeveloper(thread: AnyThreadChannel) {
  const byThread = await prisma.developer.findUnique({ where: { discordThreadId: thread.id } });
  if (byThread) return byThread;

  const normalizedThreadName = thread.name.trim().toLocaleLowerCase();
  const developers = await prisma.developer.findMany({ include: { user: true } });
  const byName = developers.find(({ user }) =>
    `${user.firstName} ${user.lastName}`.trim().toLocaleLowerCase() === normalizedThreadName
  );
  const specialty = qaThreadNames.has(normalizedThreadName)
    ? DeveloperSpecialty.QA
    : DeveloperSpecialty.ENGINEERING;

  if (byName) {
    return prisma.developer.update({
      where: { id: byName.id },
      data: { discordThreadId: thread.id, discordThreadName: thread.name, specialty }
    });
  }

  const { firstName, lastName } = splitName(thread.name);
  const passwordHash = await bcrypt.hash(randomUUID(), 12);
  return prisma.developer.create({
    data: {
      jobTitle: specialty === DeveloperSpecialty.QA ? "QA Engineer" : "Developer",
      department: "Engineering",
      specialty,
      discordThreadId: thread.id,
      discordThreadName: thread.name,
      user: {
        create: {
          email: placeholderEmail(thread.name, thread.id),
          passwordHash,
          firstName,
          lastName,
          role: UserRole.DEVELOPER,
          isActive: false
        }
      }
    }
  });
}

async function importMessage(message: Message) {
  if (message.author.bot || !message.channel.isThread()) return false;
  if (message.channel.parentId !== config.DISCORD_STATUS_CHANNEL_ID) return false;

  const parsed = parseDiscordStatus(message.content);
  if (!parsed) return false;
  const developer = await resolveDeveloper(message.channel);

  await prisma.$transaction(async (transaction) => {
    const report = await transaction.statusReport.upsert({
      where: {
        developerId_reportDate: {
          developerId: developer.id,
          reportDate: parsed.reportDate
        }
      },
      create: {
        developerId: developer.id,
        reportDate: parsed.reportDate,
        submittedAt: message.createdAt,
        source: ReportSource.DISCORD,
        sourceMessageId: message.id,
        sourceThreadId: message.channel.id,
        rawContent: message.content,
        importedAt: new Date()
      },
      update: {
        submittedAt: message.createdAt,
        source: ReportSource.DISCORD,
        sourceMessageId: message.id,
        sourceThreadId: message.channel.id,
        rawContent: message.content,
        importedAt: new Date()
      }
    });

    await transaction.statusTask.deleteMany({ where: { statusReportId: report.id } });
    await transaction.statusTask.createMany({
      data: parsed.tasks.map((task) => ({ ...task, statusReportId: report.id }))
    });
  });

  return true;
}

async function fetchStatusThreads() {
  if (!client || !config.DISCORD_STATUS_CHANNEL_ID || !config.DISCORD_GUILD_ID) {
    throw new Error("Discord is not configured.");
  }

  const parent = await client.channels.fetch(config.DISCORD_STATUS_CHANNEL_ID);
  if (!parent || !("threads" in parent)) {
    throw new Error("DISCORD_STATUS_CHANNEL_ID must identify a text or forum channel with threads.");
  }

  const active = await parent.threads.fetchActive();
  const archived = await parent.threads.fetchArchived({ type: "public", limit: 100 });
  const threads = [...active.threads.values(), ...archived.threads.values()];
  return [...new Map(threads.map((thread) => [thread.id, thread])).values()];
}

export async function syncDiscordStatuses(): Promise<SyncResult> {
  if (!discordIsConfigured()) throw new Error("Discord integration is not configured.");
  if (!client || !ready) throw new Error("Discord bot is not connected yet.");

  const result: SyncResult = {
    threadsScanned: 0,
    messagesScanned: 0,
    reportsImported: 0,
    ignoredMessages: 0,
    errors: []
  };

  const threads = await fetchStatusThreads();
  result.threadsScanned = threads.length;

  for (const thread of threads) {
    try {
      const messages = await thread.messages.fetch({ limit: 100 });
      for (const message of [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp)) {
        result.messagesScanned += 1;
        if (await importMessage(message)) result.reportsImported += 1;
        else result.ignoredMessages += 1;
      }
    } catch (error) {
      result.errors.push(`${thread.name}: ${error instanceof Error ? error.message : "Unknown import error"}`);
    }
  }

  lastSyncAt = new Date();
  lastSyncResult = result;
  return result;
}

export function getDiscordIntegrationStatus() {
  return {
    configured: discordIsConfigured(),
    connected: ready,
    guildId: config.DISCORD_GUILD_ID ?? null,
    channelId: config.DISCORD_STATUS_CHANNEL_ID ?? null,
    qaThreadNames: [...qaThreadNames],
    lastSyncAt,
    lastSyncResult
  };
}

export async function startDiscordIntegration() {
  if (!discordIsConfigured()) {
    console.log("Discord ingestion disabled: add the Discord environment variables to enable it.");
    return;
  }
  if (client) return;

  client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Channel, Partials.Message]
  });

  client.once(Events.ClientReady, async (connectedClient) => {
    ready = true;
    console.log(`Discord ingestion connected as ${connectedClient.user.tag}`);
    try {
      const result = await syncDiscordStatuses();
      console.log(`Discord backfill complete: ${result.reportsImported} reports imported.`);
    } catch (error) {
      console.error("Discord backfill failed:", error);
    }
  });

  client.on(Events.MessageCreate, (message) => {
    void importMessage(message).catch((error) => console.error("Discord message import failed:", error));
  });

  client.on(Events.MessageUpdate, (_oldMessage, updatedMessage) => {
    void updatedMessage.fetch()
      .then((message) => importMessage(message))
      .catch((error) => console.error("Discord message update import failed:", error));
  });

  client.on(Events.Error, (error) => console.error("Discord client error:", error));
  await client.login(config.DISCORD_BOT_TOKEN);
}

export function stopDiscordIntegration() {
  ready = false;
  client?.destroy();
  client = null;
}
