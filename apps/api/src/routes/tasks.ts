import { Router } from "express";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { clickUpIsConfigured, parseClickUpTaskId } from "../integrations/clickup/service.js";
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
        clickUpTicket: {
          select: {
            id: true,
            title: true,
            description: true,
            url: true,
            lastSyncedAt: true,
            syncError: true,
            comments: {
              orderBy: [{ clickUpCreatedAt: "desc" }, { createdAt: "desc" }],
              select: {
                externalId: true,
                text: true,
                author: true,
                authorAvatar: true,
                clickUpCreatedAt: true
              }
            }
          }
        },
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

    const { clickUpTicket, ...taskWithoutClickUp } = task;
    const { userId: _userId, ...publicDeveloper } = taskWithoutClickUp.statusReport.developer;
    const publicTask = {
      ...taskWithoutClickUp,
      statusReport: { ...taskWithoutClickUp.statusReport, developer: publicDeveloper }
    };

    const clickUpTaskId = clickUpTicket?.id ?? parseClickUpTaskId(task.taskUrl);
    if (!clickUpTaskId) {
      response.json({ task: publicTask, clickup: { state: "NOT_CLICKUP", ticket: null, comments: [] } });
      return;
    }
    if (clickUpTicket?.title && clickUpTicket.lastSyncedAt) {
      response.json({
        task: publicTask,
        clickup: {
          state: "AVAILABLE",
          ticket: {
            id: clickUpTicket.id,
            title: clickUpTicket.title,
            description: clickUpTicket.description,
            url: clickUpTicket.url
          },
          comments: clickUpTicket.comments.map((comment) => ({
            id: comment.externalId,
            text: comment.text,
            author: comment.author,
            authorAvatar: comment.authorAvatar,
            createdAt: comment.clickUpCreatedAt
          }))
        }
      });
      return;
    }
    if (!clickUpIsConfigured()) {
      response.json({ task: publicTask, clickup: { state: "NOT_CONFIGURED", ticket: null, comments: [] } });
      return;
    }
    response.json({ task: publicTask, clickup: { state: clickUpTicket?.syncError ? "UNAVAILABLE" : "PENDING", ticket: null, comments: [] } });
  } catch (error) {
    next(error);
  }
});
