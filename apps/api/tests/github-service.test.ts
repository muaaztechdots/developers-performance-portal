import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../src/config.js";
import { fetchGitHubPullRequest, GitHubRequestError } from "../src/integrations/github/service.js";

const originalToken = config.GITHUB_TOKEN;

beforeEach(() => {
  config.GITHUB_TOKEN = "github-test-token";
});

afterEach(() => {
  config.GITHUB_TOKEN = originalToken;
  vi.unstubAllGlobals();
});

describe("GitHub pull request service", () => {
  it("loads pull request metadata and file patches with server-side authorization", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/files?")) {
        return Response.json([{ filename: "src/app.ts", status: "modified", additions: 3, deletions: 1, changes: 4, patch: "@@ -1 +1 @@\n-old\n+new" }]);
      }
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer github-test-token");
      return Response.json({
        html_url: "https://github.com/TechDots/app/pull/12",
        number: 12,
        title: "Improve task sync",
        state: "open",
        draft: false,
        merged: false,
        user: { login: "developer" },
        head: { ref: "task-sync" },
        base: { ref: "main" },
        additions: 3,
        deletions: 1,
        changed_files: 1
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchGitHubPullRequest("https://github.com/TechDots/app/pull/12");

    expect(result.pullRequest).toMatchObject({ number: 12, title: "Improve task sync", sourceBranch: "task-sync", targetBranch: "main" });
    expect(result.files[0]).toMatchObject({ filename: "src/app.ts", additions: 3, deletions: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("allows public repository requests without a token", async () => {
    config.GITHUB_TOKEN = undefined;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).has("Authorization")).toBe(false);
      if (String(input).includes("/files?")) return Response.json([]);
      return Response.json({ number: 4, title: "Public PR", state: "open" });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchGitHubPullRequest("https://github.com/example/public/pull/4");

    expect(result.pullRequest.title).toBe("Public PR");
  });

  it("reports a private or inaccessible repository as requiring authentication when no token is configured", async () => {
    config.GITHUB_TOKEN = undefined;
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ message: "Not Found" }, { status: 404 })));

    await expect(fetchGitHubPullRequest("https://github.com/example/private/pull/4"))
      .rejects.toMatchObject({ kind: "AUTH_REQUIRED", status: 404 } satisfies Partial<GitHubRequestError>);
  });
});
