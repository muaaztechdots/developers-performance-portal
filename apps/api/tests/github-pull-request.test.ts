import { describe, expect, it } from "vitest";
import { extractGitHubPullRequestUrls, findGitHubPullRequestUrl } from "../src/lib/github-pull-request.js";

describe("GitHub pull request links", () => {
  it("extracts and normalizes PR links from comment text", () => {
    expect(extractGitHubPullRequestUrls("Please review https://github.com/TechDots/app/pull/142/files."))
      .toEqual(["https://github.com/TechDots/app/pull/142"]);
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
});
