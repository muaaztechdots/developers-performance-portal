import { Router, type Response } from "express";
import { UserRole, type Prisma } from "@prisma/client";
import { z } from "zod";
import { normalizeProjectName } from "../integrations/discord/project-matcher.js";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/authenticate.js";

export const projectsRouter = Router();
projectsRouter.use(authenticate);

export const projectInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  aliases: z.array(z.string().trim().min(1).max(200)).max(30).default([])
});

function normalizedProjectInput(input: z.infer<typeof projectInputSchema>) {
  const normalizedName = normalizeProjectName(input.name);
  const aliasesByKey = new Map<string, string>();

  for (const alias of input.aliases) {
    const normalizedAlias = normalizeProjectName(alias);
    if (normalizedAlias && normalizedAlias !== normalizedName) aliasesByKey.set(normalizedAlias, alias);
  }

  return {
    name: input.name,
    normalizedName,
    aliases: [...aliasesByKey].map(([normalizedAlias, name]) => ({ name, normalizedName: normalizedAlias }))
  };
}

async function findCatalogConflict(
  transaction: Prisma.TransactionClient,
  keys: string[],
  ignoredProjectId?: string
) {
  const projects = await transaction.project.findMany({ include: { aliases: true } });
  const keySet = new Set(keys);

  return projects.find((project) => project.id !== ignoredProjectId && [project.name, ...project.aliases.map((alias) => alias.name)]
    .some((name) => keySet.has(normalizeProjectName(name))));
}

function ensureAdmin(role: UserRole, response: Response) {
  if (role === UserRole.ADMIN) return true;
  response.status(403).json({ message: "Administrator access required." });
  return false;
}

projectsRouter.get("/", async (_request, response, next) => {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { name: "asc" },
      include: {
        aliases: { orderBy: { name: "asc" } },
        _count: { select: { tasks: true } }
      }
    });
    response.json({ projects });
  } catch (error) {
    next(error);
  }
});

projectsRouter.get("/:id", async (request, response, next) => {
  try {
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        aliases: { orderBy: { name: "asc" } },
        _count: { select: { tasks: true } }
      }
    });
    if (!project) {
      response.status(404).json({ message: "Project not found." });
      return;
    }
    response.json({ project });
  } catch (error) {
    next(error);
  }
});

projectsRouter.post("/", async (request, response, next) => {
  try {
    if (!ensureAdmin(request.session!.role, response)) return;
    const input = normalizedProjectInput(projectInputSchema.parse(request.body));
    if (!input.normalizedName) {
      response.status(400).json({ message: "Project name must contain letters or numbers." });
      return;
    }

    const project = await prisma.$transaction(async (transaction) => {
      const keys = [input.normalizedName, ...input.aliases.map((alias) => alias.normalizedName)];
      const conflict = await findCatalogConflict(transaction, keys);
      if (conflict) return { conflict } as const;

      const created = await transaction.project.create({
        data: {
          name: input.name,
          normalizedName: input.normalizedName,
          aliases: { createMany: { data: input.aliases } }
        },
        include: { aliases: { orderBy: { name: "asc" } }, _count: { select: { tasks: true } } }
      });
      return { project: created } as const;
    });

    if ("conflict" in project && project.conflict) {
      response.status(409).json({ message: `This name or alias already matches ${project.conflict.name}.` });
      return;
    }
    response.status(201).json({ project: project.project });
  } catch (error) {
    next(error);
  }
});

projectsRouter.patch("/:id", async (request, response, next) => {
  try {
    if (!ensureAdmin(request.session!.role, response)) return;
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const input = normalizedProjectInput(projectInputSchema.parse(request.body));
    if (!input.normalizedName) {
      response.status(400).json({ message: "Project name must contain letters or numbers." });
      return;
    }

    const result = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.project.findUnique({ where: { id } });
      if (!existing) return { notFound: true } as const;

      const keys = [input.normalizedName, ...input.aliases.map((alias) => alias.normalizedName)];
      const conflict = await findCatalogConflict(transaction, keys, id);
      if (conflict) return { conflict } as const;

      await transaction.projectAlias.deleteMany({ where: { projectId: id } });
      const project = await transaction.project.update({
        where: { id },
        data: {
          name: input.name,
          normalizedName: input.normalizedName,
          aliases: { createMany: { data: input.aliases } },
          tasks: { updateMany: { where: {}, data: { projectName: input.name } } }
        },
        include: { aliases: { orderBy: { name: "asc" } }, _count: { select: { tasks: true } } }
      });
      return { project } as const;
    });

    if ("notFound" in result) {
      response.status(404).json({ message: "Project not found." });
      return;
    }
    if ("conflict" in result && result.conflict) {
      response.status(409).json({ message: `This name or alias already matches ${result.conflict.name}.` });
      return;
    }
    response.json({ project: result.project });
  } catch (error) {
    next(error);
  }
});
