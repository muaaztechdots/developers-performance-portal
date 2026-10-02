import { prisma } from "../../lib/prisma.js";
import { findGitHubPullRequestUrl, findGitHubPullRequestUrlInText, parseGitHubPullRequestUrl } from "../../lib/github-pull-request.js";
import { fetchGitHubPullRequest, githubIsConfigured, isGitHubRequestError } from "./service.js";

export const GITHUB_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1_000;

export type GitHubSyncSummary = {
  linkedTasks: number;
  processedPullRequests: number;
  syncedPullRequests: number;
  failedPullRequests: number;
  rateLimitedUntil: Date | null;
};

export type GitHubSyncOptions = {
  developerId?: string;
  force?: boolean;
};

async function linkPullRequests(options: GitHubSyncOptions) {
  const tasks = await prisma.statusTask.findMany({
    where: { statusReport: options.developerId ? { developerId: options.developerId } : undefined },
    select: {
      id: true,
      description: true,
      details: true,
      taskUrl: true,
      githubPullRequestId: true,
      clickUpTicket: {
        select: {
          description: true,
          comments: {
            orderBy: [{ clickUpCreatedAt: "desc" }, { createdAt: "desc" }],
            select: { text: true }
          }
        }
      }
    }
  });
  let linkedTasks = 0;

  for (const task of tasks) {
    const url = findGitHubPullRequestUrl(task.clickUpTicket?.comments ?? [])
      ?? findGitHubPullRequestUrlInText([task.details, task.description, task.clickUpTicket?.description, task.taskUrl]);
    const reference = parseGitHubPullRequestUrl(url);
    if (!reference) continue;

    const owner = reference.owner.toLowerCase();
    const repository = reference.repository.toLowerCase();
    const pullRequest = await prisma.gitHubPullRequest.upsert({
      where: { owner_repository_number: { owner, repository, number: reference.number } },
      create: { owner, repository, number: reference.number, url: reference.url },
      update: { url: reference.url },
      select: { id: true }
    });
    if (task.githubPullRequestId === pullRequest.id) continue;

    await prisma.statusTask.update({
      where: { id: task.id },
      data: { githubPullRequestId: pullRequest.id }
    });
    linkedTasks += 1;
  }

  return linkedTasks;
}

export async function syncGitHubPullRequests(options: GitHubSyncOptions = {}): Promise<GitHubSyncSummary> {
  const summary: GitHubSyncSummary = {
    linkedTasks: await linkPullRequests(options),
    processedPullRequests: 0,
    syncedPullRequests: 0,
    failedPullRequests: 0,
    rateLimitedUntil: null
  };
  const staleBefore = new Date(Date.now() - GITHUB_REFRESH_INTERVAL_MS);
  const pullRequests = await prisma.gitHubPullRequest.findMany({
    where: {
      tasks: { some: options.developerId ? { statusReport: { developerId: options.developerId } } : {} },
      OR: options.force ? undefined : [
        { lastSyncAttemptAt: null },
        { lastSyncAttemptAt: { lte: staleBefore } },
        ...(githubIsConfigured() ? [{ syncErrorKind: "AUTH_REQUIRED" }] : [])
      ]
    },
    orderBy: [{ lastSyncAttemptAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
    select: { id: true, url: true, owner: true, repository: true, number: true }
  });

  console.log(`[github] ${pullRequests.length} pull request${pullRequests.length === 1 ? "" : "s"} ready to import; ${summary.linkedTasks} task link${summary.linkedTasks === 1 ? "" : "s"} discovered.`);

  for (const [index, pullRequest] of pullRequests.entries()) {
    summary.processedPullRequests += 1;
    const attemptedAt = new Date();
    const label = `${pullRequest.owner}/${pullRequest.repository}#${pullRequest.number}`;
    console.log(`[github] Importing pull request ${index + 1}/${pullRequests.length}: ${label}`);
    await prisma.gitHubPullRequest.update({ where: { id: pullRequest.id }, data: { lastSyncAttemptAt: attemptedAt } });

    try {
      const data = await fetchGitHubPullRequest(pullRequest.url);
      await prisma.$transaction(async (transaction) => {
        await transaction.gitHubPullRequest.update({
          where: { id: pullRequest.id },
          data: {
            url: data.pullRequest.url,
            title: data.pullRequest.title,
            state: data.pullRequest.state,
            draft: data.pullRequest.draft,
            merged: data.pullRequest.merged,
            author: data.pullRequest.author,
            authorAvatar: data.pullRequest.authorAvatar,
            sourceBranch: data.pullRequest.sourceBranch,
            targetBranch: data.pullRequest.targetBranch,
            additions: data.pullRequest.additions,
            deletions: data.pullRequest.deletions,
            changedFiles: data.pullRequest.changedFiles,
            filesTruncated: data.filesTruncated,
            lastSyncAttemptAt: attemptedAt,
            lastSyncedAt: new Date(),
            syncError: null,
            syncErrorKind: null
          }
        });
        await transaction.gitHubPullRequestFile.deleteMany({ where: { githubPullRequestId: pullRequest.id } });
        if (data.files.length) {
          await transaction.gitHubPullRequestFile.createMany({
            data: data.files.map((file, sortOrder) => ({
              githubPullRequestId: pullRequest.id,
              filename: file.filename,
              status: file.status,
              additions: file.additions,
              deletions: file.deletions,
              changes: file.changes,
              patch: file.patch,
              previousFilename: file.previousFilename,
              blobUrl: file.blobUrl,
              sortOrder
            }))
          });
        }
      });
      summary.syncedPullRequests += 1;
      console.log(`[github] Imported ${label}: ${data.files.length} changed file${data.files.length === 1 ? "" : "s"}.`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown GitHub sync error";
      const errorKind = isGitHubRequestError(error) ? error.kind : "UNAVAILABLE";
      await prisma.gitHubPullRequest.update({
        where: { id: pullRequest.id },
        data: { lastSyncAttemptAt: attemptedAt, syncError: errorMessage, syncErrorKind: errorKind }
      });

      if (isGitHubRequestError(error) && error.kind === "RATE_LIMITED") {
        summary.failedPullRequests += 1;
        summary.rateLimitedUntil = error.retryAt;
        console.warn(`[github] Rate limit reached${error.retryAt ? `; sync will resume after ${error.retryAt.toISOString()}` : ""}.`);
        break;
      }

      summary.failedPullRequests += 1;
      if (isGitHubRequestError(error)) {
        console.error(`[github] Pull request ${label} sync failed (${error.kind}): ${error.message}`);
      } else {
        console.error(`[github] Pull request ${label} sync failed:`, error);
      }
    }
  }

  return summary;
}
