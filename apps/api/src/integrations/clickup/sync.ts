import {
  clickUpIsConfigured,
  fetchClickUpTicket,
  isClickUpRateLimitError,
  parseClickUpTaskId
} from "./service.js";
import { prisma } from "../../lib/prisma.js";

export const CLICKUP_REFRESH_INTERVAL_MS = 5 * 60 * 1_000;

type ClickUpSyncSummary = {
  linkedTasks: number;
  processedTickets: number;
  syncedTickets: number;
  failedTickets: number;
  rateLimitedUntil: Date | null;
};

async function linkUntrackedTasks() {
  const tasks = await prisma.statusTask.findMany({
    where: {
      taskUrl: { contains: "app.clickup.com/t/", mode: "insensitive" },
      clickUpTaskId: null
    },
    select: { id: true, taskUrl: true }
  });
  let linkedTasks = 0;

  for (const task of tasks) {
    const clickUpTaskId = parseClickUpTaskId(task.taskUrl);
    if (!clickUpTaskId || !task.taskUrl) continue;
    await prisma.$transaction([
      prisma.clickUpTicket.upsert({
        where: { id: clickUpTaskId },
        create: { id: clickUpTaskId, url: task.taskUrl },
        update: {}
      }),
      prisma.statusTask.updateMany({
        where: { id: task.id, clickUpTaskId: null },
        data: { clickUpTaskId }
      })
    ]);
    linkedTasks += 1;
  }

  return linkedTasks;
}

export async function syncClickUpTickets(): Promise<ClickUpSyncSummary> {
  const summary: ClickUpSyncSummary = {
    linkedTasks: 0,
    processedTickets: 0,
    syncedTickets: 0,
    failedTickets: 0,
    rateLimitedUntil: null
  };
  if (!clickUpIsConfigured()) return summary;

  summary.linkedTasks = await linkUntrackedTasks();
  const staleBefore = new Date(Date.now() - CLICKUP_REFRESH_INTERVAL_MS);
  const tickets = await prisma.clickUpTicket.findMany({
    where: {
      tasks: { some: {} },
      OR: [
        { lastSyncAttemptAt: null },
        { lastSyncAttemptAt: { lte: staleBefore } }
      ]
    },
    orderBy: [{ lastSyncAttemptAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
    select: { id: true }
  });

  console.log(`[clickup] ${tickets.length} ticket${tickets.length === 1 ? "" : "s"} ready to import; ${summary.linkedTasks} new task link${summary.linkedTasks === 1 ? "" : "s"} discovered.`);

  for (const [index, ticket] of tickets.entries()) {
    summary.processedTickets += 1;
    console.log(`[clickup] Importing ticket ${index + 1}/${tickets.length}: ${ticket.id}`);
    const attemptedAt = new Date();
    await prisma.clickUpTicket.update({
      where: { id: ticket.id },
      data: { lastSyncAttemptAt: attemptedAt }
    });

    try {
      const data = await fetchClickUpTicket(ticket.id);
      await prisma.$transaction(async (transaction) => {
        await transaction.clickUpTicket.update({
          where: { id: ticket.id },
          data: {
            title: data.ticket.title,
            description: data.ticket.description,
            url: data.ticket.url,
            lastSyncAttemptAt: attemptedAt,
            lastSyncedAt: new Date(),
            syncError: data.commentsFetched ? null : "ClickUp comments could not be fetched."
          }
        });

        if (data.commentsFetched) {
          await transaction.clickUpComment.deleteMany({ where: { clickUpTicketId: ticket.id } });
          if (data.comments.length) {
            await transaction.clickUpComment.createMany({
              data: data.comments.map((comment) => ({
                clickUpTicketId: ticket.id,
                externalId: comment.id,
                text: comment.text,
                author: comment.author,
                authorAvatar: comment.authorAvatar,
                clickUpCreatedAt: comment.createdAt ? new Date(comment.createdAt) : null
              }))
            });
          }
        }
      });
      summary.syncedTickets += 1;
      const logTitle = data.ticket.title.replace(/\s+/g, " ").slice(0, 120);
      console.log(`[clickup] Imported ${ticket.id}: "${logTitle}" (${data.comments.length} comment${data.comments.length === 1 ? "" : "s"}).`);
    } catch (error) {
      if (isClickUpRateLimitError(error)) {
        summary.rateLimitedUntil = error.retryAt;
        await prisma.clickUpTicket.update({
          where: { id: ticket.id },
          data: { lastSyncAttemptAt: attemptedAt }
        });
        console.warn(`[clickup] Rate limit reached; ticket sync will resume after ${error.retryAt.toISOString()}.`);
        break;
      }

      summary.failedTickets += 1;
      await prisma.clickUpTicket.update({
        where: { id: ticket.id },
        data: {
          lastSyncAttemptAt: attemptedAt,
          syncError: error instanceof Error ? error.message : "Unknown ClickUp sync error"
        }
      });
      console.error(`[clickup] Ticket ${ticket.id} sync failed:`, error);
    }
  }

  return summary;
}
