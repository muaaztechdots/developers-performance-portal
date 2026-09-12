import { Router } from "express";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { clickUpIsConfigured, fetchClickUpTicket, parseClickUpTaskId } from "../integrations/clickup/service.js";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/authenticate.js";

export const tasksRouter = Router();
tasksRouter.use(authenticate);

export const taskProjectAssignmentSchema = z.object({
  projectId: z.uuid().nullable()
});

tasksRouter.patch("/:id/project", async (request, response, next) => {
  try {
    if (request.session!.role !== UserRole.ADMIN) {
      response.status(403).json({ message: "Administrator access required." });
      return;
    }

    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const { projectId } = taskProjectAssignmentSchema.parse(request.body);
    const task = await prisma.statusTask.findFirst({
      where: { id, statusReport: { developer: { user: { role: UserRole.DEVELOPER } } } },
      select: { id: true }
    });
    if (!task) {
      response.status(404).json({ message: "Task not found." });
      return;
    }

    const project = projectId
      ? await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true } })
      : null;
    if (projectId && !project) {
      response.status(404).json({ message: "Project not found." });
      return;
    }

    const updatedTask = await prisma.statusTask.update({
      where: { id },
      data: {
        projectId: project?.id ?? null,
        projectName: project?.name ?? null
      },
      select: {
        id: true,
        projectName: true,
        project: { select: { id: true, name: true } }
      }
    });
    response.json({ task: updatedTask });
  } catch (error) {
    next(error);
  }
});

tasksRouter.get("/:id", async (request, response, next) => {
  try {
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const task = await prisma.statusTask.findFirst({
      where: { id, statusReport: { developer: { user: { role: UserRole.DEVELOPER } } } },
      select: {
        id: true,
        description: true,
        durationMinutes: true,
        taskUrl: true,
        projectName: true,
        project: { select: { id: true, name: true } },
        statusReport: {
          select: {
            reportDate: true,
            developer: {
              select: {
                id: true,
                userId: true,
                user: { select: { firstName: true, lastName: true } }
              }
            }
          }
        }
      }
    });

    if (!task) {
      response.status(404).json({ message: "Task not found." });
      return;
    }
    if (request.session!.role !== UserRole.ADMIN && task.statusReport.developer.userId !== request.session!.sub) {
      response.status(403).json({ message: "You cannot view this task." });
      return;
    }

    const { userId: _userId, ...publicDeveloper } = task.statusReport.developer;
    const publicTask = {
      ...task,
      statusReport: { ...task.statusReport, developer: publicDeveloper }
    };

    const clickUpTaskId = parseClickUpTaskId(task.taskUrl);
    if (!clickUpTaskId) {
      response.json({ task: publicTask, clickup: { state: "NOT_CLICKUP", ticket: null, comments: [] } });
      return;
    }
    if (!clickUpIsConfigured()) {
      response.json({ task: publicTask, clickup: { state: "NOT_CONFIGURED", ticket: null, comments: [] } });
      return;
    }

    try {
      const clickup = await fetchClickUpTicket(clickUpTaskId);
      response.json({ task: publicTask, clickup: { state: "AVAILABLE", ...clickup } });
    } catch (error) {
      console.error(`ClickUp enrichment failed for task ${task.id}:`, error);
      response.json({ task: publicTask, clickup: { state: "UNAVAILABLE", ticket: null, comments: [] } });
    }
  } catch (error) {
    next(error);
  }
});
