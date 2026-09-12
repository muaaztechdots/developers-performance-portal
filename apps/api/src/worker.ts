import { SyncJobStatus } from "@prisma/client";
import { prisma } from "./lib/prisma.js";
import { importDeveloperThreadTasks } from "./integrations/discord/task-importer.js";
import { CLICKUP_REFRESH_INTERVAL_MS, syncClickUpTickets } from "./integrations/clickup/sync.js";

let stopping = false;
let processing = false;
let clickUpProcessing = false;

async function processClickUpQueue() {
  if (clickUpProcessing || stopping) return;
  clickUpProcessing = true;
  console.log("[clickup] Sync cycle started.");
  try {
    const result = await syncClickUpTickets();
    const rateLimitMessage = result.rateLimitedUntil
      ? ` Rate limited; remaining tickets will resume after ${result.rateLimitedUntil.toISOString()}.`
      : "";
    console.log(`[clickup] Sync cycle completed: ${result.syncedTickets} synced, ${result.failedTickets} failed, ${result.linkedTasks} tasks linked.${rateLimitMessage}`);
  } catch (error) {
    console.error("[clickup] Sync cycle failed:", error);
  } finally {
    clickUpProcessing = false;
  }
}

async function claimNextJob() {
  const candidate = await prisma.discordSyncJob.findFirst({
    where: { status: SyncJobStatus.PENDING },
    orderBy: { createdAt: "asc" }
  });
  if (!candidate) return null;

  const claimed = await prisma.discordSyncJob.updateMany({
    where: { id: candidate.id, status: SyncJobStatus.PENDING },
    data: { status: SyncJobStatus.RUNNING, startedAt: new Date(), error: null }
  });
  return claimed.count === 1 ? candidate : null;
}

async function processQueue() {
  if (processing || stopping) return;
  processing = true;
  try {
    for (;;) {
      const job = await claimNextJob();
      if (!job) break;
      try {
        const result = await importDeveloperThreadTasks(job.developerId, async (progress) => {
          await prisma.discordSyncJob.update({ where: { id: job.id }, data: progress });
        });
        await prisma.discordSyncJob.update({
          where: { id: job.id },
          data: { ...result, status: SyncJobStatus.COMPLETED, completedAt: new Date() }
        });
        await processClickUpQueue();
      } catch (error) {
        console.error(`Discord task sync ${job.id} failed:`, error);
        await prisma.discordSyncJob.update({
          where: { id: job.id },
          data: {
            status: SyncJobStatus.FAILED,
            error: error instanceof Error ? error.message : "Unknown worker error",
            completedAt: new Date()
          }
        });
      }
    }
  } finally {
    processing = false;
  }
}

await prisma.discordSyncJob.updateMany({
  where: { status: SyncJobStatus.RUNNING },
  data: { status: SyncJobStatus.PENDING, startedAt: null }
});

console.log("Discord task worker is ready.");
const timer = setInterval(() => void processQueue(), 1_500);
const clickUpTimer = setInterval(() => void processClickUpQueue(), CLICKUP_REFRESH_INTERVAL_MS);
void processQueue();
void processClickUpQueue();

async function shutdown() {
  stopping = true;
  clearInterval(timer);
  clearInterval(clickUpTimer);
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
