import { ReportPeriod, ReportSource, UserRole, type Prisma } from "@prisma/client";
import { REST, Routes } from "discord.js";
import { config } from "../../config.js";
import { prisma } from "../../lib/prisma.js";
import { loadProjectCatalog, selectMatchingProject } from "./project-matcher.js";
import { parseDiscordStatuses } from "./status-parser.js";

type DiscordMessage = {
  id: string;
  content: string;
  timestamp: string;
  author?: { bot?: boolean };
};

type DiscordThread = {
  id: string;
  guild_id?: string;
  parent_id?: string | null;
};

type ImportProgress = {
  processedMessages: number;
  importedReports: number;
  importedTasks: number;
};

async function fetchAllThreadMessages(threadId: string) {
  if (!config.DISCORD_BOT_TOKEN || !config.DISCORD_GUILD_ID || !config.DISCORD_STATUS_CHANNEL_ID) {
    throw new Error("Discord integration is not configured.");
  }
  const rest = new REST({ version: "10" }).setToken(config.DISCORD_BOT_TOKEN);
  const thread = await rest.get(Routes.channel(threadId)) as DiscordThread;
  if (thread.guild_id !== config.DISCORD_GUILD_ID || thread.parent_id !== config.DISCORD_STATUS_CHANNEL_ID) {
    throw new Error("The linked Discord thread is outside the configured daily-status channel.");
  }
  const messages: DiscordMessage[] = [];
  let before: string | undefined;

  for (;;) {
    const query = new URLSearchParams({ limit: "100" });
    if (before) query.set("before", before);
    const page = await rest.get(Routes.channelMessages(threadId), { query }) as DiscordMessage[];
    messages.push(...page);
    if (page.length < 100) break;
    before = page.at(-1)?.id;
    if (!before) break;
  }

  return messages.sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
}

async function importTodayTasks(
  transaction: Prisma.TransactionClient,
  developerId: string,
  threadId: string,
  message: DiscordMessage
) {
  const parsedReports = parseDiscordStatuses(message.content);
  const projectCatalog = await loadProjectCatalog(transaction);
  let importedReports = 0;
  let importedTasks = 0;

  for (const parsed of parsedReports) {
    const todayTasks = parsed.tasks.filter((task) => task.period === ReportPeriod.TODAY);
    if (!todayTasks.length) continue;

    const report = await transaction.statusReport.upsert({
      where: { developerId_reportDate: { developerId, reportDate: parsed.reportDate } },
      create: {
        developerId,
        reportDate: parsed.reportDate,
        submittedAt: new Date(message.timestamp),
        source: ReportSource.DISCORD,
        sourceMessageId: message.id,
        sourceThreadId: threadId,
        rawContent: message.content,
        importedAt: new Date()
      },
      update: {
        submittedAt: new Date(message.timestamp),
        source: ReportSource.DISCORD,
        sourceMessageId: message.id,
        sourceThreadId: threadId,
        rawContent: message.content,
        importedAt: new Date()
      }
    });

    await transaction.statusTask.deleteMany({
      where: { statusReportId: report.id, period: ReportPeriod.TODAY }
    });

    const taskRows = [];
    for (const task of todayTasks) {
      const project = selectMatchingProject(projectCatalog, task.projectName);
      taskRows.push({
        ...task,
        projectId: project?.id ?? null,
        projectName: project?.name ?? null,
        statusReportId: report.id
      });
    }
    await transaction.statusTask.createMany({ data: taskRows });
    importedReports += 1;
    importedTasks += taskRows.length;
  }

  return { importedReports, importedTasks };
}

export async function importDeveloperThreadTasks(
  developerId: string,
  onProgress?: (progress: ImportProgress) => Promise<void>
) {
  const developer = await prisma.developer.findFirst({
    where: { id: developerId, user: { role: UserRole.DEVELOPER } }
  });
  if (!developer?.discordThreadId) throw new Error("This developer is not linked to a Discord thread.");

  const messages = await fetchAllThreadMessages(developer.discordThreadId);
  const progress: ImportProgress = { processedMessages: 0, importedReports: 0, importedTasks: 0 };

  for (const message of messages) {
    progress.processedMessages += 1;
    if (!message.author?.bot) {
      const imported = await prisma.$transaction((transaction) =>
        importTodayTasks(transaction, developer.id, developer.discordThreadId!, message)
      );
      progress.importedReports += imported.importedReports;
      progress.importedTasks += imported.importedTasks;
    }
    if (onProgress && progress.processedMessages % 5 === 0) await onProgress(progress);
  }

  if (onProgress) await onProgress(progress);
  return progress;
}
