import { describe, expect, it } from "vitest";
import { extractGitHubPullRequestUrls, findGitHubPullRequestUrl, findGitHubPullRequestUrlInText, parseGitHubPullRequestUrl } from "../src/lib/github-pull-request.js";

describe("GitHub pull request links", () => {
  it("extracts and normalizes PR links from comment text", () => {
    expect(extractGitHubPullRequestUrls("Please review https://github.com/TechDots/app/pull/142/files."))
      .toEqual(["https://github.com/TechDots/app/pull/142"]);
    expect(extractGitHubPullRequestUrls("PR github.com/TechDots/app/pull/143"))
      .toEqual(["https://github.com/TechDots/app/pull/143"]);
  });

  it("ignores GitHub links that are not pull requests", () => {
    expect(extractGitHubPullRequestUrls("Repo: https://github.com/TechDots/app/issues/142"))
      .toEqual([]);
  });

  it("returns the first PR from the newest matching comment", () => {
    expect(findGitHubPullRequestUrl([
      { text: "No PR here" },
      { text: "Merged https://github.com/TechDots/api/pull/25" },
      { text: "Older https://github.com/TechDots/api/pull/18" }
    ])).toBe("https://github.com/TechDots/api/pull/25");
  });

  it("parses an exact GitHub pull request reference", () => {
    expect(parseGitHubPullRequestUrl("https://github.com/TechDots/api/pull/25/files")).toEqual({
      owner: "TechDots",
      repository: "api",
      number: 25,
      url: "https://github.com/TechDots/api/pull/25"
    });
  });

  it("rejects lookalike GitHub hosts", () => {
    expect(parseGitHubPullRequestUrl("https://github.com.evil.example/TechDots/api/pull/25")).toBeNull();
  });

  it("finds PR links embedded in task text", () => {
    expect(findGitHubPullRequestUrlInText([null, "Implemented in https://github.com/TechDots/web/pull/72/files"])).toBe("https://github.com/TechDots/web/pull/72");
  });
});
