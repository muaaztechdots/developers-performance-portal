import type { Prisma, Project } from "@prisma/client";

export function normalizeProjectName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
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

function isLikelySameProject(left: string, right: string) {
  if (left === right) return true;
  if (Math.min(left.length, right.length) < 4) return false;
  const allowedDistance = Math.max(1, Math.floor(Math.max(left.length, right.length) * 0.15));
  return levenshteinDistance(left, right) <= allowedDistance;
}

export async function resolveProject(
  transaction: Prisma.TransactionClient,
  incomingName: string | null
): Promise<Project | null> {
  const name = incomingName?.trim();
  if (!name) return null;
  const normalizedName = normalizeProjectName(name);
  if (!normalizedName) return null;

  const exactProject = await transaction.project.findUnique({ where: { normalizedName } });
  if (exactProject) return exactProject;
  const exactAlias = await transaction.projectAlias.findUnique({
    where: { normalizedName },
    include: { project: true }
  });
  if (exactAlias) return exactAlias.project;

  const projects = await transaction.project.findMany({ include: { aliases: true } });
  const fuzzyMatch = projects.find((project) =>
    [project.normalizedName, ...project.aliases.map((alias) => alias.normalizedName)]
      .some((candidate) => isLikelySameProject(normalizedName, candidate))
  );

  if (fuzzyMatch) {
    await transaction.projectAlias.create({
      data: { projectId: fuzzyMatch.id, name, normalizedName }
    });
    return fuzzyMatch;
  }

  return transaction.project.create({ data: { name, normalizedName } });
}
