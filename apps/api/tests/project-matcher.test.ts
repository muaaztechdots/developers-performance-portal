import { describe, expect, it } from "vitest";
import {
  isLikelySameProject,
  levenshteinDistance,
  normalizeProjectName,
  selectMatchingProject
} from "../src/integrations/discord/project-matcher.js";

const date = new Date("2026-09-12T00:00:00.000Z");

function project(name: string, normalizedName = normalizeProjectName(name), aliases: string[] = []) {
  return {
    id: name,
    name,
    normalizedName,
    createdAt: date,
    updatedAt: date,
    aliases: aliases.map((alias) => ({ name: alias, normalizedName: normalizeProjectName(alias) }))
  };
}

describe("project-name matching", () => {
  it.each([
    "HomeliCare",
    "Homeli Care",
    "HOMELICARE",
    "HomeliCare Web",
    "Homeli Care Web App",
    "HomeliCare Mobile",
    "HomeliCare Mobile App",
    "HomeliCare App",
    "Project HomeliCare"
  ])("normalizes the project variant %s to one comparison key", (name) => {
    expect(normalizeProjectName(name)).toBe("homelicare");
  });

  it("applies platform suffix handling to every project", () => {
    expect(normalizeProjectName("EasyRinger Web App")).toBe("easyringer");
    expect(normalizeProjectName("Q-Score Mob App")).toBe("qscore");
  });

  it("does not strip platform words from the middle of a project name", () => {
    expect(normalizeProjectName("Mobile First Platform")).toBe("mobilefirstplatform");
  });

  it("recognizes conservative spelling variations", () => {
    expect(levenshteinDistance(normalizeProjectName("HomeliCare"), normalizeProjectName("Homlicare"))).toBe(1);
    expect(isLikelySameProject(normalizeProjectName("Lightning"), normalizeProjectName("Lightening"))).toBe(true);
  });

  it("matches a Discord variant to an existing catalog project", () => {
    const homelicare = project("HomeliCare", "homelicare", ["HC"]);
    const matched = selectMatchingProject([project("Cohabit"), homelicare], "homlicare mobile app");
    expect(matched?.id).toBe(homelicare.id);
  });

  it("matches an explicit alias", () => {
    const homelicare = project("HomeliCare", "homelicare", ["HC"]);
    expect(selectMatchingProject([homelicare], "hc")?.id).toBe(homelicare.id);
  });

  it("prefers a canonical base project over a legacy platform duplicate", () => {
    const qscore = project("Qscore", "qscore");
    const legacyMobile = project("Q-Score Mob App", "qscoremobapp");
    expect(selectMatchingProject([legacyMobile, qscore], "Qscore Mobile App")?.id).toBe(qscore.id);
  });

  it("returns null when no catalog project is a safe match", () => {
    expect(selectMatchingProject([project("Cohabit"), project("HomeliCare")], "Entirely New Product")).toBeNull();
  });
});
