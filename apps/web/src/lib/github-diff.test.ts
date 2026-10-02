import { describe, expect, it } from "vitest";
import { parseGitHubPatch } from "./github-diff";

describe("GitHub patch parser", () => {
  it("tracks old and new line numbers across a hunk", () => {
    const lines = parseGitHubPatch("@@ -10,2 +10,3 @@\n unchanged\n-removed\n+added\n+another");

    expect(lines).toEqual([
      { kind: "hunk", content: "@@ -10,2 +10,3 @@", oldLine: null, newLine: null },
      { kind: "context", content: " unchanged", oldLine: 10, newLine: 10 },
      { kind: "deletion", content: "-removed", oldLine: 11, newLine: null },
      { kind: "addition", content: "+added", oldLine: null, newLine: 11 },
      { kind: "addition", content: "+another", oldLine: null, newLine: 12 }
    ]);
  });
});
