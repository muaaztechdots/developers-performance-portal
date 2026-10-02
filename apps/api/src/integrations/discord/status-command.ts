import { SyncJobStatus, UserRole } from "@prisma/client";
import {
  ActionRowBuilder,
  type AnyThreadChannel,
  type ButtonInteraction,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputApplicationCommandData,
  type ChatInputCommandInteraction,
  type Client,
  type Interaction,
  MessageFlags,
  ModalBuilder,
  type ModalSubmitInteraction,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  type StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";
import { config } from "../../config.js";
import { parseClickUpTaskId } from "../clickup/service.js";
import { parseGitHubPullRequestUrl } from "../../lib/github-pull-request.js";
import { prisma } from "../../lib/prisma.js";
import {
  containsDurationToken,
  dateInTimeZone,
  normalizeStatusDetails,
  parseSubmittedDuration,
  renderDiscordStatusSubmission
} from "./status-submission.js";

const COMMAND_NAME = "status";
const PROJECT_SELECT_PREFIX = "daily-status-project:";
const PAGE_BUTTON_PREFIX = "daily-status-page:";
const SUBMIT_BUTTON_PREFIX = "daily-status-submit:";
const REMOVE_BUTTON_PREFIX = "daily-status-remove:";
const DATE_BUTTON_PREFIX = "daily-status-change-date:";
const DATE_MODAL_PREFIX = "daily-status-date:";
const TASK_MODAL_PREFIX = "daily-status-task:";
const PROJECTS_PER_PAGE = 25;
const DISCORD_MESSAGE_LIMIT = 2_000;

const statusCommand = new SlashCommandBuilder()
  .setName(COMMAND_NAME)
  .setDescription("Build and submit a unified daily status");

type StatusInteraction =
  | ChatInputCommandInteraction
  | ModalSubmitInteraction
  | ButtonInteraction
  | StringSelectMenuInteraction;

class StatusSubmissionError extends Error {}

function dateToIso(reportDate: Date) {
  return reportDate.toISOString().slice(0, 10);
}

function formatDate(reportDate: Date) {
  return [
    reportDate.getUTCDate().toString().padStart(2, "0"),
    (reportDate.getUTCMonth() + 1).toString().padStart(2, "0"),
    reportDate.getUTCFullYear()
  ].join("/");
}

function parseIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const reportDate = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return dateToIso(reportDate) === value.trim() ? reportDate : null;
}

function truncate(value: string, length: number) {
  return value.length <= length ? value : `${value.slice(0, length - 1)}…`;
}

async function getSubmissionThread(interaction: StatusInteraction) {
  if (interaction.guildId !== config.DISCORD_GUILD_ID || !config.DISCORD_STATUS_CHANNEL_ID) {
    throw new StatusSubmissionError("Use /status in the configured daily-status server.");
  }
  if (!interaction.channelId) {
    throw new StatusSubmissionError("Use /status inside your assigned daily-status thread.");
  }

  const channel = await interaction.client.channels.fetch(interaction.channelId).catch((error: unknown) => {
    const code = typeof error === "object" && error && "code" in error ? error.code : undefined;
    if (code === 50001 || code === 50013) {
      throw new StatusSubmissionError(
        "I cannot access this status thread. Add Daily Status Bot to the thread and allow View Channel, Read Message History, and Send Messages in Threads."
      );
    }
    throw error;
  });
  if (!channel?.isThread() || channel.parentId !== config.DISCORD_STATUS_CHANNEL_ID) {
    throw new StatusSubmissionError("Use /status inside your assigned daily-status thread.");
  }

  const developer = await prisma.developer.findFirst({
    where: { discordThreadId: channel.id, user: { role: UserRole.DEVELOPER } },
    select: { id: true, timezone: true }
  });
  if (!developer) {
    throw new StatusSubmissionError(
      "This thread is not linked to a developer yet. Ask an administrator to run Sync Discord first."
    );
  }

  return { thread: channel, developer };
}

async function replyWithError(interaction: StatusInteraction, error: unknown) {
  const message = error instanceof StatusSubmissionError
    ? error.message
    : "The status could not be saved. Please try again or contact an administrator.";
  if (!(error instanceof StatusSubmissionError)) console.error("Discord status command error:", error);

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ content: message, components: [] });
  } else {
    await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
  }
}

async function buildComposer(developerId: string, reportDate: Date, requestedPage = 0) {
  const [submission, projects] = await Promise.all([
    prisma.discordStatusSubmission.findUnique({
      where: { developerId_reportDate: { developerId, reportDate } },
      include: { tasks: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } }
    }),
    prisma.project.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
  ]);
  const tasks = submission?.tasks ?? [];
  const totalPages = Math.max(1, Math.ceil(projects.length / PROJECTS_PER_PAGE));
  const page = Math.max(0, Math.min(requestedPage, totalPages - 1));
  const projectPage = projects.slice(page * PROJECTS_PER_PAGE, (page + 1) * PROJECTS_PER_PAGE);
  const reportDateIso = dateToIso(reportDate);
  const visibleTasks = tasks.slice(0, 12).map((task, index) => {
    const hours = Math.floor(task.durationMinutes / 60);
    const minutes = task.durationMinutes % 60;
    const time = `${hours ? `${hours}h` : ""}${hours && minutes ? " " : ""}${minutes ? `${minutes}m` : ""}`;
    return `${index + 1}. ${task.projectName} — ${truncate(task.description, 72)} — ${time}${task.taskUrl ? " — ClickUp linked" : ""}${task.pullRequestUrl ? " — PR linked" : ""}`;
  });
  if (tasks.length > visibleTasks.length) visibleTasks.push(`…and ${tasks.length - visibleTasks.length} more task(s)`);

  const content = [
    `**Daily status form — ${formatDate(reportDate)}**`,
    visibleTasks.length ? visibleTasks.join("\n") : "No tasks added yet.",
    "",
    projects.length
      ? `Select a project below to add a task${totalPages > 1 ? ` (project page ${page + 1}/${totalPages})` : ""}.`
      : "No projects are available. Ask an administrator to add the project in the dashboard first.",
    tasks.length ? "Add more tasks or submit the complete status when ready." : ""
  ].filter((line, index, lines) => line || (index > 0 && lines[index - 1])).join("\n");

  const components = [];
  if (projectPage.length) {
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`${PROJECT_SELECT_PREFIX}${reportDateIso}:${page}`)
        .setPlaceholder("Choose a project to add a task")
        .addOptions(projectPage.map((project) => ({ label: truncate(project.name, 100), value: project.id })))
    ));
  }

  const buttons = new ActionRowBuilder<ButtonBuilder>();
  if (totalPages > 1) {
    buttons.addComponents(
      new ButtonBuilder()
        .setCustomId(`${PAGE_BUTTON_PREFIX}${reportDateIso}:${page - 1}`)
        .setLabel("Previous projects")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`${PAGE_BUTTON_PREFIX}${reportDateIso}:${page + 1}`)
        .setLabel("Next projects")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === totalPages - 1)
    );
  }
  buttons.addComponents(
    new ButtonBuilder()
      .setCustomId(`${DATE_BUTTON_PREFIX}${reportDateIso}:${page}`)
      .setLabel("Change date")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${REMOVE_BUTTON_PREFIX}${reportDateIso}:${page}`)
      .setLabel("Remove last task")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!tasks.length),
    new ButtonBuilder()
      .setCustomId(`${SUBMIT_BUTTON_PREFIX}${reportDateIso}:${page}`)
      .setLabel(submission?.messageId ? "Update submitted status" : "Submit status")
      .setStyle(ButtonStyle.Success)
      .setDisabled(!tasks.length)
  );
  components.push(buttons);

  return { content, components, submission, tasks, page };
}

function buildTaskModal(projectId: string, projectName: string, reportDate: Date) {
  const taskTitle = new TextInputBuilder()
    .setCustomId("task_title")
    .setLabel("Task title")
    .setPlaceholder("Example: Mobile App Implementation")
    .setMinLength(2)
    .setMaxLength(300)
    .setRequired(true)
    .setStyle(TextInputStyle.Short);
  const details = new TextInputBuilder()
    .setCustomId("details")
    .setLabel("Task details - one item per line")
    .setPlaceholder("Built the messages screen\nAdded unread counts\nFixed the tests")
    .setMinLength(2)
    .setMaxLength(1_200)
    .setRequired(true)
    .setStyle(TextInputStyle.Paragraph);
  const time = new TextInputBuilder()
    .setCustomId("time")
    .setLabel("Time spent")
    .setPlaceholder("Examples: 2h, 45m, or 1h 30m")
    .setMaxLength(30)
    .setRequired(true)
    .setStyle(TextInputStyle.Short);
  const clickUpTicket = new TextInputBuilder()
    .setCustomId("clickup_link")
    .setLabel("ClickUp ticket link - optional")
    .setPlaceholder("https://app.clickup.com/t/...")
    .setMaxLength(500)
    .setRequired(false)
    .setStyle(TextInputStyle.Short);
  const pullRequest = new TextInputBuilder()
    .setCustomId("pr_link")
    .setLabel("GitHub PR link - optional")
    .setPlaceholder("https://github.com/owner/repository/pull/123")
    .setMaxLength(500)
    .setRequired(false)
    .setStyle(TextInputStyle.Short);

  return new ModalBuilder()
    .setCustomId(`${TASK_MODAL_PREFIX}${projectId}:${dateToIso(reportDate)}`)
    .setTitle(`Add task: ${projectName}`.slice(0, 45))
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(taskTitle),
      new ActionRowBuilder<TextInputBuilder>().addComponents(details),
      new ActionRowBuilder<TextInputBuilder>().addComponents(time),
      new ActionRowBuilder<TextInputBuilder>().addComponents(clickUpTicket),
      new ActionRowBuilder<TextInputBuilder>().addComponents(pullRequest)
    );
}

function buildDateModal(reportDate: Date, page: number) {
  const date = new TextInputBuilder()
    .setCustomId("date")
    .setLabel("Status date - YYYY-MM-DD")
    .setValue(dateToIso(reportDate))
    .setMinLength(10)
    .setMaxLength(10)
    .setRequired(true)
    .setStyle(TextInputStyle.Short);

  return new ModalBuilder()
    .setCustomId(`${DATE_MODAL_PREFIX}${dateToIso(reportDate)}:${page}`)
    .setTitle("Change status date")
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(date));
}

async function handleCommand(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const { developer } = await getSubmissionThread(interaction);
    const reportDate = dateInTimeZone(new Date(), developer.timezone);
    const composer = await buildComposer(developer.id, reportDate);
    await interaction.editReply({ content: composer.content, components: composer.components });
  } catch (error) {
    await replyWithError(interaction, error);
  }
}

async function handleProjectSelection(interaction: StringSelectMenuInteraction) {
  try {
    await getSubmissionThread(interaction);
    const dateAndPage = interaction.customId.slice(PROJECT_SELECT_PREFIX.length);
    const reportDate = parseIsoDate(dateAndPage.split(":")[0] ?? "");
    if (!reportDate) throw new StatusSubmissionError("The selected status date is invalid. Run /status again.");
    const projectId = interaction.values[0];
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true } });
    if (!project) throw new StatusSubmissionError("That project no longer exists. Run /status again.");
    await interaction.showModal(buildTaskModal(project.id, project.name, reportDate));
  } catch (error) {
    await replyWithError(interaction, error);
  }
}

async function handleTaskModal(interaction: ModalSubmitInteraction) {
  if (interaction.isFromMessage()) await interaction.deferUpdate();
  else await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const { thread, developer } = await getSubmissionThread(interaction);
    const [projectId = "", reportDateValue = ""] = interaction.customId.slice(TASK_MODAL_PREFIX.length).split(":");
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true } });
    if (!project) throw new StatusSubmissionError("That project no longer exists. Run /status again.");

    const reportDate = parseIsoDate(reportDateValue);
    if (!reportDate) throw new StatusSubmissionError("The selected status date is invalid. Run /status again.");
    const description = interaction.fields.getTextInputValue("task_title").trim().replace(/\s+/g, " ");
    const details = normalizeStatusDetails(interaction.fields.getTextInputValue("details"));
    const durationMinutes = parseSubmittedDuration(interaction.fields.getTextInputValue("time"));
    const rawClickUpUrl = interaction.fields.getTextInputValue("clickup_link").trim();
    const clickUpTaskId = rawClickUpUrl ? parseClickUpTaskId(rawClickUpUrl) : null;
    const rawPullRequestUrl = interaction.fields.getTextInputValue("pr_link").trim();
    const pullRequest = rawPullRequestUrl ? parseGitHubPullRequestUrl(rawPullRequestUrl) : null;

    if (!description || !details) throw new StatusSubmissionError("Task title and at least one detail are required.");
    if (containsDurationToken(description) || containsDurationToken(details)) {
      throw new StatusSubmissionError("Put time only in the Time spent field, not in the title or details.");
    }
    if (!durationMinutes) throw new StatusSubmissionError("Enter time as 2h, 45m, or 1h 30m (maximum 24h).");
    if (rawClickUpUrl && !clickUpTaskId) {
      throw new StatusSubmissionError("Enter a complete ClickUp ticket URL, such as https://app.clickup.com/t/abc123.");
    }
    if (rawPullRequestUrl && !pullRequest) {
      throw new StatusSubmissionError("Enter a complete GitHub pull-request URL, such as https://github.com/org/repo/pull/123.");
    }

    await prisma.$transaction(async (transaction) => {
      const submission = await transaction.discordStatusSubmission.upsert({
        where: { developerId_reportDate: { developerId: developer.id, reportDate } },
        create: { developerId: developer.id, reportDate, threadId: thread.id },
        update: { threadId: thread.id }
      });
      const tasks = await transaction.discordStatusSubmissionTask.findMany({
        where: { submissionId: submission.id },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
      });
      const nextTask = {
        projectName: project.name,
        description,
        details,
        durationMinutes,
        taskUrl: rawClickUpUrl || null,
        pullRequestUrl: pullRequest?.url ?? null
      };
      const content = renderDiscordStatusSubmission(reportDate, [...tasks, nextTask]);
      if (content.length > DISCORD_MESSAGE_LIMIT) {
        throw new StatusSubmissionError("This status is too long for one Discord message. Shorten the task details before adding it.");
      }
      await transaction.discordStatusSubmissionTask.create({
        data: {
          submissionId: submission.id,
          projectId: project.id,
          ...nextTask,
          submittedByDiscordUserId: interaction.user.id,
          sortOrder: (tasks.at(-1)?.sortOrder ?? -1) + 1
        }
      });
    });

    const composer = await buildComposer(developer.id, reportDate);
    await interaction.editReply({ content: composer.content, components: composer.components });
  } catch (error) {
    await replyWithError(interaction, error);
  }
}

async function publishSubmission(
  thread: AnyThreadChannel,
  submissionId: string,
  messageId: string | null,
  content: string
) {
  let message = messageId ? await thread.messages.fetch(messageId).catch(() => null) : null;
  if (message && message.author.id !== thread.client.user.id) message = null;
  if (message) {
    await message.edit({ content, allowedMentions: { parse: [] } });
    return message.id;
  }

  const created = await thread.send({ content, allowedMentions: { parse: [] } });
  await prisma.discordStatusSubmission.update({ where: { id: submissionId }, data: { messageId: created.id } });
  return created.id;
}

async function queueStatusImport(developerId: string) {
  const pending = await prisma.discordSyncJob.findFirst({
    where: { developerId, status: SyncJobStatus.PENDING },
    orderBy: { createdAt: "desc" }
  });
  if (!pending) await prisma.discordSyncJob.create({ data: { developerId, forceRefresh: false } });
}

function parseButtonState(customId: string, prefix: string) {
  const [dateValue = "", pageValue = "0"] = customId.slice(prefix.length).split(":");
  return { reportDate: parseIsoDate(dateValue), page: Number.parseInt(pageValue, 10) || 0 };
}

async function handleDateButton(interaction: ButtonInteraction) {
  try {
    await getSubmissionThread(interaction);
    const { reportDate, page } = parseButtonState(interaction.customId, DATE_BUTTON_PREFIX);
    if (!reportDate) throw new StatusSubmissionError("The selected status date is invalid. Run /status again.");
    await interaction.showModal(buildDateModal(reportDate, page));
  } catch (error) {
    await replyWithError(interaction, error);
  }
}

async function handleDateModal(interaction: ModalSubmitInteraction) {
  if (interaction.isFromMessage()) await interaction.deferUpdate();
  else await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const { developer } = await getSubmissionThread(interaction);
    const state = parseButtonState(interaction.customId, DATE_MODAL_PREFIX);
    const reportDate = parseIsoDate(interaction.fields.getTextInputValue("date"));
    if (!reportDate) throw new StatusSubmissionError("Enter the status date as YYYY-MM-DD, for example 2026-10-01.");
    const composer = await buildComposer(developer.id, reportDate, state.page);
    await interaction.editReply({ content: composer.content, components: composer.components });
  } catch (error) {
    await replyWithError(interaction, error);
  }
}

async function handlePageButton(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  try {
    const { developer } = await getSubmissionThread(interaction);
    const { reportDate, page } = parseButtonState(interaction.customId, PAGE_BUTTON_PREFIX);
    if (!reportDate) throw new StatusSubmissionError("The selected status date is invalid. Run /status again.");
    const composer = await buildComposer(developer.id, reportDate, page);
    await interaction.editReply({ content: composer.content, components: composer.components });
  } catch (error) {
    await replyWithError(interaction, error);
  }
}

async function handleRemoveButton(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  try {
    const { developer } = await getSubmissionThread(interaction);
    const { reportDate, page } = parseButtonState(interaction.customId, REMOVE_BUTTON_PREFIX);
    if (!reportDate) throw new StatusSubmissionError("The selected status date is invalid. Run /status again.");
    const submission = await prisma.discordStatusSubmission.findUnique({
      where: { developerId_reportDate: { developerId: developer.id, reportDate } },
      include: { tasks: { orderBy: [{ sortOrder: "desc" }, { createdAt: "desc" }], take: 1 } }
    });
    const lastTask = submission?.tasks[0];
    if (lastTask) await prisma.discordStatusSubmissionTask.delete({ where: { id: lastTask.id } });
    const composer = await buildComposer(developer.id, reportDate, page);
    await interaction.editReply({ content: composer.content, components: composer.components });
  } catch (error) {
    await replyWithError(interaction, error);
  }
}

async function handleSubmitButton(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  try {
    const { thread, developer } = await getSubmissionThread(interaction);
    const { reportDate, page } = parseButtonState(interaction.customId, SUBMIT_BUTTON_PREFIX);
    if (!reportDate) throw new StatusSubmissionError("The selected status date is invalid. Run /status again.");
    const composer = await buildComposer(developer.id, reportDate, page);
    if (!composer.submission || !composer.tasks.length) throw new StatusSubmissionError("Add at least one task before submitting.");
    const content = renderDiscordStatusSubmission(reportDate, composer.tasks);
    if (content.length > DISCORD_MESSAGE_LIMIT) throw new StatusSubmissionError("This status is too long to publish in Discord.");

    await publishSubmission(thread, composer.submission.id, composer.submission.messageId, content);
    await queueStatusImport(developer.id);
    const updatedComposer = await buildComposer(developer.id, reportDate, page);
    await interaction.editReply({
      content: `Status submitted for ${formatDate(reportDate)}. It has been queued for import.\n\n${updatedComposer.content}`,
      components: updatedComposer.components
    });
  } catch (error) {
    await replyWithError(interaction, error);
  }
}

export async function handleDiscordStatusInteraction(interaction: Interaction) {
  if (interaction.isChatInputCommand() && interaction.commandName === COMMAND_NAME) {
    await handleCommand(interaction);
    return;
  }
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith(PROJECT_SELECT_PREFIX)) {
    await handleProjectSelection(interaction);
    return;
  }
  if (interaction.isModalSubmit() && interaction.customId.startsWith(TASK_MODAL_PREFIX)) {
    await handleTaskModal(interaction);
    return;
  }
  if (interaction.isModalSubmit() && interaction.customId.startsWith(DATE_MODAL_PREFIX)) {
    await handleDateModal(interaction);
    return;
  }
  if (!interaction.isButton()) return;
  if (interaction.customId.startsWith(PAGE_BUTTON_PREFIX)) await handlePageButton(interaction);
  else if (interaction.customId.startsWith(DATE_BUTTON_PREFIX)) await handleDateButton(interaction);
  else if (interaction.customId.startsWith(REMOVE_BUTTON_PREFIX)) await handleRemoveButton(interaction);
  else if (interaction.customId.startsWith(SUBMIT_BUTTON_PREFIX)) await handleSubmitButton(interaction);
}

export async function registerDiscordStatusCommand(client: Client<true>) {
  if (!config.DISCORD_GUILD_ID) return;
  const guild = await client.guilds.fetch(config.DISCORD_GUILD_ID);
  const commands = await guild.commands.fetch();
  const existing = commands.find((command) => command.name === COMMAND_NAME);
  const commandData = statusCommand.toJSON() as ChatInputApplicationCommandData;
  if (existing) await existing.edit(commandData);
  else await guild.commands.create(commandData);
}
