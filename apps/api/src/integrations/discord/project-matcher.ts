import type { Prisma, Project, ProjectAlias } from "@prisma/client";

const TRAILING_PROJECT_QUALIFIERS = new Set([
  "android",
  "app",
  "application",
  "ios",
  "mob",
  "mobapp",
  "mobile",
  "mobileapp",
  "web",
  "webapp",
  "website"
]);

function projectNameTokens(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/&/g, " and ")
    .toLocaleLowerCase()
    .match(/[a-z0-9]+/g) ?? [];
}

/**
 * Produces the comparison key used by both the project catalog and Discord
 * imports. Platform suffixes are deliberately ignored so "Acme Web App" and
 * "Acme Mobile" can resolve to the same managed project.
 */
export function normalizeProjectName(value: string) {
  const originalTokens = projectNameTokens(value);
  const tokens = [...originalTokens];

  if (tokens[0] === "project" && tokens.length > 1) tokens.shift();
  while (tokens.length > 1 && TRAILING_PROJECT_QUALIFIERS.has(tokens.at(-1)!)) tokens.pop();

  return (tokens.length ? tokens : originalTokens).join("");
}

export function levenshteinDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitution = previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1);
      current[rightIndex] = Math.min(previous[rightIndex] + 1, current[rightIndex - 1] + 1, substitution);
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length];
}

function allowedProjectNameDistance(left: string, right: string) {
  if (Math.min(left.length, right.length) < 4) return 0;
  return Math.max(1, Math.floor(Math.max(left.length, right.length) * 0.15));
}

export function isLikelySameProject(left: string, right: string) {
  if (left === right) return true;
  return levenshteinDistance(left, right) <= allowedProjectNameDistance(left, right);
}

export type ProjectCatalogEntry = Project & {
  aliases: Array<Pick<ProjectAlias, "name" | "normalizedName">>;
};

export function selectMatchingProject(projects: ProjectCatalogEntry[], incomingName: string | null) {
  const normalizedName = normalizeProjectName(incomingName?.trim() ?? "");
  if (!normalizedName) return null;

  return projects
    .map((project) => {
      const candidateNames = [project.name, ...project.aliases.map((alias) => alias.name)];
      const distances = candidateNames.map((candidate) =>
        levenshteinDistance(normalizedName, normalizeProjectName(candidate))
      );
      const distance = Math.min(...distances);
      const comparisonName = candidateNames[distances.indexOf(distance)] ?? project.name;
      const candidateKey = normalizeProjectName(comparisonName);

      return {
        project,
        distance,
        matches: distance <= allowedProjectNameDistance(normalizedName, candidateKey),
        canonicalRank: project.normalizedName === normalizeProjectName(project.name) ? 0 : 1
      };
    })
    .filter((candidate) => candidate.matches)
    .sort((left, right) =>
      left.distance - right.distance ||
      left.canonicalRank - right.canonicalRank ||
      left.project.name.length - right.project.name.length ||
      left.project.createdAt.getTime() - right.project.createdAt.getTime()
    )[0]?.project ?? null;
}

export function loadProjectCatalog(transaction: Prisma.TransactionClient) {
  return transaction.project.findMany({ include: { aliases: true } });
}

/** Finds an existing catalog project only. Discord imports must never create projects. */
export async function resolveProject(
  transaction: Prisma.TransactionClient,
  incomingName: string | null
): Promise<Project | null> {
  const projects = await loadProjectCatalog(transaction);
  return selectMatchingProject(projects, incomingName);
}
