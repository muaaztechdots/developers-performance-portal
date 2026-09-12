import { SyncJobStatus } from "@prisma/client";
import { prisma } from "./lib/prisma.js";
import { importDeveloperThreadTasks } from "./integrations/discord/task-importer.js";

let stopping = false;
let processing = false;

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
void processQueue();

async function shutdown() {
  stopping = true;
  clearInterval(timer);
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
