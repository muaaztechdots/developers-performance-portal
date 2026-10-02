import { beforeEach, describe, expect, it, vi } from "vitest";

const { statusTaskFindMany, pullRequestFindMany } = vi.hoisted(() => ({
  statusTaskFindMany: vi.fn(),
  pullRequestFindMany: vi.fn()
}));

vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    statusTask: { findMany: statusTaskFindMany },
    gitHubPullRequest: { findMany: pullRequestFindMany }
  }
}));

import { syncGitHubPullRequests } from "../src/integrations/github/sync.js";

beforeEach(() => {
  statusTaskFindMany.mockReset().mockResolvedValue([]);
  pullRequestFindMany.mockReset().mockResolvedValue([]);
});

describe("GitHub sync selection", () => {
  it("uses the 24-hour freshness filter for a normal all-developer job", async () => {
    await syncGitHubPullRequests({ developerId: "developer-1", force: false });

    expect(pullRequestFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tasks: { some: { statusReport: { developerId: "developer-1" } } },
        OR: expect.arrayContaining([
          { lastSyncAttemptAt: null },
          { lastSyncAttemptAt: { lte: expect.any(Date) } }
        ])
      })
    }));
  });

  it("removes the freshness filter for a forced single-developer job", async () => {
    await syncGitHubPullRequests({ developerId: "developer-1", force: true });

    expect(pullRequestFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tasks: { some: { statusReport: { developerId: "developer-1" } } },
        OR: undefined
      })
    }));
  });
});
