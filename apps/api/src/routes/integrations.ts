import { Router } from "express";
import { SyncJobStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { authenticate } from "../middleware/authenticate.js";
import { getDiscordIntegrationStatus, syncDiscordDevelopers } from "../integrations/discord/service.js";
import { parseDiscordStatus } from "../integrations/discord/status-parser.js";
import { prisma } from "../lib/prisma.js";

export const integrationsRouter = Router();
integrationsRouter.use(authenticate);
integrationsRouter.use((request, response, next) => {
  if (request.session!.role !== UserRole.ADMIN) {
    response.status(403).json({ message: "Administrator access required." });
    return;
  }
  next();
});

integrationsRouter.get("/discord", (_request, response) => {
  response.json({ discord: getDiscordIntegrationStatus() });
});

integrationsRouter.post("/discord/parse-preview", (request, response, next) => {
  try {
    const { content } = z.object({ content: z.string().min(1).max(10_000) }).parse(request.body);
    const parsed = parseDiscordStatus(content);
    response.status(parsed ? 200 : 422).json(parsed ? { parsed } : { message: "No dated status tasks were recognized." });
  } catch (error) {
    next(error);
  }
});

integrationsRouter.post("/discord/sync-developers", async (_request, response, next) => {
  try {
    response.json({ result: await syncDiscordDevelopers() });
  } catch (error) {
    if (error instanceof Error && /not configured|not connected/.test(error.message)) {
      response.status(503).json({ message: error.message });
      return;
    }
    next(error);
  }
});

integrationsRouter.post("/discord/sync-statuses", async (_request, response, next) => {
  try {
    const developerSync = await syncDiscordDevelopers();
    const developers = await prisma.developer.findMany({
      where: { discordThreadId: { not: null }, user: { role: UserRole.DEVELOPER } },
      orderBy: { user: { firstName: "asc" } },
      include: { user: { select: { firstName: true, lastName: true } } }
    });

    const jobs = [];
    for (const developer of developers) {
      const activeJob = await prisma.discordSyncJob.findFirst({
        where: { developerId: developer.id, status: { in: [SyncJobStatus.PENDING, SyncJobStatus.RUNNING] } },
        orderBy: { createdAt: "desc" }
      });
      const job = activeJob ?? await prisma.discordSyncJob.create({ data: { developerId: developer.id } });
      jobs.push({ ...job, developer: { id: developer.id, user: developer.user } });
    }

    response.status(202).json({ jobs, developerSync });
  } catch (error) {
    if (error instanceof Error && /not configured|not connected/.test(error.message)) {
      response.status(503).json({ message: error.message });
      return;
    }
    next(error);
  }
});

integrationsRouter.get("/discord/sync-statuses/progress", async (request, response, next) => {
  try {
    const { jobIds } = z.object({ jobIds: z.string().min(1).max(4_000) }).parse(request.query);
    const ids = z.array(z.uuid()).min(1).max(100).parse(jobIds.split(","));
    const jobs = await prisma.discordSyncJob.findMany({
      where: { id: { in: ids }, developer: { user: { role: UserRole.DEVELOPER } } },
      orderBy: { createdAt: "asc" },
      include: {
        developer: {
          select: { id: true, user: { select: { firstName: true, lastName: true } } }
        }
      }
    });
    response.json({ jobs });
  } catch (error) {
    next(error);
  }
});
