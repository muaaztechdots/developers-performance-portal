import { describe, expect, it } from "vitest";
import { levenshteinDistance, normalizeProjectName } from "../src/integrations/discord/project-matcher.js";

describe("project-name matching", () => {
  it("normalizes spacing and casing", () => {
    expect(normalizeProjectName("Homli care")).toBe(normalizeProjectName("HOMLICARE"));
  });

  it("recognizes a small spelling variation", () => {
    expect(levenshteinDistance(normalizeProjectName("HomeliCare"), normalizeProjectName("Homlicare"))).toBe(1);
  });
});
