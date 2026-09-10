import { Router } from "express";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { authenticate } from "../middleware/authenticate.js";
import { getDiscordIntegrationStatus, syncDiscordDevelopers, syncDiscordStatuses } from "../integrations/discord/service.js";
import { parseDiscordStatus } from "../integrations/discord/status-parser.js";

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

integrationsRouter.post("/discord/sync", async (_request, response, next) => {
  try {
    response.json({ result: await syncDiscordStatuses() });
  } catch (error) {
    if (error instanceof Error && /not configured|not connected/.test(error.message)) {
      response.status(503).json({ message: error.message });
      return;
    }
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
