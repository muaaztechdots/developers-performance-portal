import { SyncJobPhase, SyncJobStatus } from "@prisma/client";
import { prisma } from "./lib/prisma.js";
import { importDeveloperThreadTasks } from "./integrations/discord/task-importer.js";
import { CLICKUP_REFRESH_INTERVAL_MS, syncClickUpTickets, type ClickUpSyncOptions } from "./integrations/clickup/sync.js";
import { syncGitHubPullRequests, type GitHubSyncOptions } from "./integrations/github/sync.js";

let stopping = false;
let processing = false;
let clickUpQueue: Promise<void> = Promise.resolve();
let githubQueue: Promise<void> = Promise.resolve();

function processClickUpQueue(options: ClickUpSyncOptions = {}) {
  const cycle = clickUpQueue.then(async () => {
    console.log(`[clickup] ${options.force ? "Forced " : ""}sync cycle started${options.developerId ? ` for developer ${options.developerId}` : ""}.`);
    const result = await syncClickUpTickets(options);
    const rateLimitMessage = result.rateLimitedUntil
      ? ` Rate limited; remaining tickets will resume after ${result.rateLimitedUntil.toISOString()}.`
      : "";
    console.log(`[clickup] Sync cycle completed: ${result.syncedTickets} synced, ${result.failedTickets} failed, ${result.linkedTasks} tasks linked.${rateLimitMessage}`);
    return result;
  });
  clickUpQueue = cycle.then(() => undefined, () => undefined);
  return cycle;
}

function processGitHubQueue(options: GitHubSyncOptions = {}) {
  const cycle = githubQueue.then(async () => {
    console.log(`[github] ${options.force ? "Forced " : ""}sync cycle started${options.developerId ? ` for developer ${options.developerId}` : ""}.`);
    const result = await syncGitHubPullRequests(options);
    const rateLimitMessage = result.rateLimitedUntil
      ? ` Rate limited; remaining pull requests will resume after ${result.rateLimitedUntil.toISOString()}.`
      : "";
    console.log(`[github] Sync cycle completed: ${result.syncedPullRequests} synced, ${result.failedPullRequests} failed, ${result.linkedTasks} tasks linked.${rateLimitMessage}`);
    return result;
  });
  githubQueue = cycle.then(() => undefined, () => undefined);
  return cycle;
}

async function claimNextJob() {
  const candidate = await prisma.discordSyncJob.findFirst({
    where: { status: SyncJobStatus.PENDING },
    orderBy: { createdAt: "asc" }
  });
  if (!candidate) return null;

  const claimed = await prisma.discordSyncJob.updateMany({
    where: { id: candidate.id, status: SyncJobStatus.PENDING },
    data: {
      status: SyncJobStatus.RUNNING,
      phase: SyncJobPhase.DISCORD,
      startedAt: new Date(),
      error: null,
      clickUpLinkedTasks: 0,
      clickUpProcessedTickets: 0,
      clickUpSyncedTickets: 0,
      clickUpFailedTickets: 0,
      githubLinkedTasks: 0,
      githubProcessedPullRequests: 0,
      githubSyncedPullRequests: 0,
      githubFailedPullRequests: 0
    }
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
          data: { ...result, phase: SyncJobPhase.CLICKUP }
        });
        const refreshPolicy = await prisma.discordSyncJob.findUniqueOrThrow({
          where: { id: job.id },
          select: { forceRefresh: true }
        });
        const clickUpResult = await processClickUpQueue({ developerId: job.developerId, force: refreshPolicy.forceRefresh });
        await prisma.discordSyncJob.update({
          where: { id: job.id },
          data: {
            phase: SyncJobPhase.GITHUB,
            clickUpLinkedTasks: clickUpResult.linkedTasks,
            clickUpProcessedTickets: clickUpResult.processedTickets,
            clickUpSyncedTickets: clickUpResult.syncedTickets,
            clickUpFailedTickets: clickUpResult.failedTickets
          }
        });
        const githubResult = await processGitHubQueue({ developerId: job.developerId, force: refreshPolicy.forceRefresh });
        await prisma.discordSyncJob.update({
          where: { id: job.id },
          data: {
            status: SyncJobStatus.COMPLETED,
            githubLinkedTasks: githubResult.linkedTasks,
            githubProcessedPullRequests: githubResult.processedPullRequests,
            githubSyncedPullRequests: githubResult.syncedPullRequests,
            githubFailedPullRequests: githubResult.failedPullRequests,
            completedAt: new Date()
          }
        });
      } catch (error) {
        console.error(`Developer sync job ${job.id} failed:`, error);
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
  data: { status: SyncJobStatus.PENDING, phase: SyncJobPhase.DISCORD, startedAt: null }
});

console.log("Discord task worker is ready.");
const timer = setInterval(() => void processQueue(), 1_500);
async function refreshStaleIntegrations() {
  await processClickUpQueue();
  await processGitHubQueue();
}
const integrationTimer = setInterval(() => void refreshStaleIntegrations().catch((error) => console.error("[integrations] Scheduled sync cycle failed:", error)), CLICKUP_REFRESH_INTERVAL_MS);
void processQueue();
void refreshStaleIntegrations().catch((error) => console.error("[integrations] Startup sync cycle failed:", error));

async function shutdown() {
  stopping = true;
  clearInterval(timer);
  clearInterval(integrationTimer);
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
