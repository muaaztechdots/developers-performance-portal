import { Router } from "express";
import { ReportPeriod, TaskStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/authenticate.js";

export const statusReportsRouter = Router();
statusReportsRouter.use(authenticate);

const taskSchema = z.object({
  period: z.enum(ReportPeriod),
  projectName: z.string().trim().max(200).nullable().optional(),
  description: z.string().trim().min(1),
  durationMinutes: z.number().int().min(0).nullable().optional(),
  taskUrl: z.url().nullable().optional(),
  status: z.enum(TaskStatus).optional(),
  sortOrder: z.number().int().min(0).optional()
});

export const statusReportInputSchema = z.object({
  developerId: z.uuid(),
  reportDate: z.iso.date(),
  notes: z.string().trim().nullable().optional(),
  submit: z.boolean().default(false),
  tasks: z.array(taskSchema).min(1)
});

function dateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

statusReportsRouter.get("/", async (request, response, next) => {
  try {
    const query = z.object({
      developerId: z.uuid().optional(),
      from: z.iso.date().optional(),
      to: z.iso.date().optional()
    }).parse(request.query);

    const ownDeveloper = await prisma.developer.findUnique({ where: { userId: request.session!.sub } });
    const developerId = request.session!.role === UserRole.ADMIN ? query.developerId : ownDeveloper?.id;
    const reports = await prisma.statusReport.findMany({
      where: {
        developerId,
        developer: { user: { role: UserRole.DEVELOPER } },
        reportDate: {
          gte: query.from ? dateOnly(query.from) : undefined,
          lte: query.to ? dateOnly(query.to) : undefined
        }
      },
      orderBy: { reportDate: "desc" },
      include: {
        tasks: { orderBy: [{ period: "asc" }, { sortOrder: "asc" }] },
        developer: { include: { user: { select: { firstName: true, lastName: true, email: true } } } }
      }
    });
    response.json({ reports });
  } catch (error) {
    next(error);
  }
});

statusReportsRouter.post("/", async (request, response, next) => {
  try {
    const input = statusReportInputSchema.parse(request.body);
    const developer = await prisma.developer.findFirst({
      where: { id: input.developerId, user: { role: UserRole.DEVELOPER } }
    });
    const canWrite = request.session!.role === UserRole.ADMIN || developer?.userId === request.session!.sub;
    if (!canWrite) {
      response.status(403).json({ message: "You cannot create a report for this developer." });
      return;
    }

    const reportDate = dateOnly(input.reportDate);
    const report = await prisma.$transaction(async (transaction) => {
      const saved = await transaction.statusReport.upsert({
        where: { developerId_reportDate: { developerId: input.developerId, reportDate } },
        create: {
          developerId: input.developerId,
          reportDate,
          notes: input.notes,
          submittedAt: input.submit ? new Date() : null
        },
        update: {
          notes: input.notes,
          submittedAt: input.submit ? new Date() : undefined
        }
      });
      await transaction.statusTask.deleteMany({ where: { statusReportId: saved.id } });
      await transaction.statusTask.createMany({
        data: input.tasks.map((task, index) => ({
          statusReportId: saved.id,
          period: task.period,
          projectName: task.projectName,
          description: task.description,
          durationMinutes: task.durationMinutes,
          taskUrl: task.taskUrl,
          status: task.status ?? null,
          sortOrder: task.sortOrder ?? index
        }))
      });
      return transaction.statusReport.findUniqueOrThrow({
        where: { id: saved.id },
        include: { tasks: { orderBy: [{ period: "asc" }, { sortOrder: "asc" }] } }
      });
    });
    response.status(201).json({ report });
  } catch (error) {
    next(error);
  }
});
