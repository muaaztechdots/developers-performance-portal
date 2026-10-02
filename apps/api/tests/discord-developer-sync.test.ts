import { describe, expect, it } from "vitest";
import { developerNameMatchesThread } from "../src/integrations/discord/service.js";

describe("single-developer Discord thread matching", () => {
  it("matches a thread to the developer name without case or spacing differences", () => {
    expect(developerNameMatchesThread("  Muhammad   Zeeshan ", "Muhammad", "Zeeshan")).toBe(true);
    expect(developerNameMatchesThread("AHSAN", "Ahsan", "")).toBe(true);
  });

  it("does not link a different developer's thread", () => {
    expect(developerNameMatchesThread("Shakil", "Ahsan", "")).toBe(false);
  });
});
