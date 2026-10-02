export type DiffLine = {
  kind: "hunk" | "addition" | "deletion" | "context" | "meta";
  content: string;
  oldLine: number | null;
  newLine: number | null;
};

export function parseGitHubPatch(patch: string): DiffLine[] {
  let oldLine = 0;
  let newLine = 0;

  return patch.split("\n").map((content) => {
    if (content.startsWith("@@")) {
      const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(content);
      if (match) {
        oldLine = Number(match[1]);
        newLine = Number(match[2]);
      }
      return { kind: "hunk", content, oldLine: null, newLine: null };
    }
    if (content.startsWith("+") && !content.startsWith("+++")) {
      const line = { kind: "addition", content, oldLine: null, newLine } as const;
      newLine += 1;
      return line;
    }
    if (content.startsWith("-") && !content.startsWith("---")) {
      const line = { kind: "deletion", content, oldLine, newLine: null } as const;
      oldLine += 1;
      return line;
    }
    if (content.startsWith("\\")) {
      return { kind: "meta", content, oldLine: null, newLine: null };
    }

    const line = { kind: "context", content, oldLine, newLine } as const;
    oldLine += 1;
    newLine += 1;
    return line;
  });
}
