import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { DeveloperSpecialty, ReportPeriod, SyncJobStatus, UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/authenticate.js";

export const developersRouter = Router();
developersRouter.use(authenticate);

const createDeveloperSchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8).max(128),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  jobTitle: z.string().trim().max(150).optional(),
  department: z.string().trim().max(150).optional(),
  timezone: z.string().trim().max(100).default("Asia/Karachi")
});

const timezoneSchema = z.string().trim().min(1).max(100).refine((timezone) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}, "Invalid timezone.");

export const updateDeveloperSchema = z.object({
  email: z.string().trim().pipe(z.email()).transform((value) => value.toLowerCase()),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  jobTitle: z.string().trim().max(150).transform((value) => value || null),
  department: z.string().trim().max(150).transform((value) => value || null),
  timezone: timezoneSchema,
  specialty: z.enum(DeveloperSpecialty),
  isActive: z.boolean()
});

function yesterdayInPakistan() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "numeric",
    day: "numeric"
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value);
  const today = new Date(Date.UTC(part("year"), part("month") - 1, part("day")));
  today.setUTCDate(today.getUTCDate() - 1);
  return today;
}

developersRouter.get("/", async (_request, response, next) => {
  try {
    const yesterdayDate = yesterdayInPakistan();
    const developers = await prisma.developer.findMany({
      where: { user: { role: UserRole.DEVELOPER } },
      orderBy: { user: { firstName: "asc" } },
      select: {
        id: true,
        jobTitle: true,
        department: true,
        timezone: true,
        specialty: true,
        discordThreadId: true,
        discordThreadName: true,
        user: { select: { email: true, firstName: true, lastName: true, isActive: true } },
        _count: { select: { statusReports: true } },
        statusReports: {
          where: {
            reportDate: yesterdayDate,
            tasks: { some: { period: ReportPeriod.TODAY } }
          },
          select: { id: true },
          take: 1
        }
      }
    });
    response.json({
      developers: developers.map(({ statusReports, ...developer }) => ({
        ...developer,
        yesterdayStatusSubmitted: statusReports.length > 0
      })),
      yesterdayDate: yesterdayDate.toISOString().slice(0, 10)
    });
  } catch (error) {
    next(error);
  }
});

developersRouter.get("/:id", async (request, response, next) => {
  try {
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const developer = await prisma.developer.findFirst({
      where: { id, user: { role: UserRole.DEVELOPER } },
      include: {
        user: { select: { email: true, firstName: true, lastName: true, isActive: true } },
        statusReports: {
          orderBy: [{ reportDate: "desc" }, { submittedAt: "desc" }],
          include: {
            tasks: {
              where: { period: ReportPeriod.TODAY },
              orderBy: [{ sortOrder: "desc" }, { createdAt: "desc" }],
              include: { project: { select: { id: true, name: true } } }
            }
          }
        },
        syncJobs: { orderBy: { createdAt: "desc" }, take: 1 }
      }
    });
    if (!developer) {
      response.status(404).json({ message: "Developer not found." });
      return;
    }
    response.json({ developer });
  } catch (error) {
    next(error);
  }
});

developersRouter.patch("/:id", async (request, response, next) => {
  try {
    if (request.session!.role !== UserRole.ADMIN) {
      response.status(403).json({ message: "Administrator access required." });
      return;
    }

    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const input = updateDeveloperSchema.parse(request.body);
    const existing = await prisma.developer.findFirst({
      where: { id, user: { role: UserRole.DEVELOPER } },
      select: { id: true }
    });
    if (!existing) {
      response.status(404).json({ message: "Developer not found." });
      return;
    }

    const developer = await prisma.developer.update({
      where: { id },
      data: {
        jobTitle: input.jobTitle,
        department: input.department,
        timezone: input.timezone,
        specialty: input.specialty,
        user: {
          update: {
            email: input.email,
            firstName: input.firstName,
            lastName: input.lastName,
            isActive: input.isActive
          }
        }
      },
      include: {
        user: { select: { email: true, firstName: true, lastName: true, isActive: true } }
      }
    });

    response.json({ developer });
  } catch (error) {
    next(error);
  }
});

developersRouter.post("/:id/sync-tasks", async (request, response, next) => {
  try {
    if (request.session!.role !== UserRole.ADMIN) {
      response.status(403).json({ message: "Administrator access required." });
      return;
    }
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const developer = await prisma.developer.findFirst({
      where: { id, user: { role: UserRole.DEVELOPER } }
    });
    if (!developer) {
      response.status(404).json({ message: "Developer not found." });
      return;
    }
    if (!developer.discordThreadId) {
      response.status(409).json({ message: "This developer is not linked to a Discord thread." });
      return;
    }

    const existingJob = await prisma.discordSyncJob.findFirst({
      where: { developerId: id, status: { in: [SyncJobStatus.PENDING, SyncJobStatus.RUNNING] } },
      orderBy: { createdAt: "desc" }
    });
    const job = existingJob ?? await prisma.discordSyncJob.create({ data: { developerId: id } });
    response.status(existingJob ? 200 : 202).json({ job });
  } catch (error) {
    next(error);
  }
});

developersRouter.get("/:id/sync-jobs/:jobId", async (request, response, next) => {
  try {
    const { id, jobId } = z.object({ id: z.uuid(), jobId: z.uuid() }).parse(request.params);
    const job = await prisma.discordSyncJob.findFirst({ where: { id: jobId, developerId: id } });
    if (!job) {
      response.status(404).json({ message: "Sync job not found." });
      return;
    }
    response.json({ job });
  } catch (error) {
    next(error);
  }
});

developersRouter.post("/", async (request, response, next) => {
  try {
    if (request.session!.role !== UserRole.ADMIN) {
      response.status(403).json({ message: "Administrator access required." });
      return;
    }
    const input = createDeveloperSchema.parse(request.body);
    const passwordHash = await bcrypt.hash(input.password, 12);
    const developer = await prisma.developer.create({
      data: {
        jobTitle: input.jobTitle,
        department: input.department,
        timezone: input.timezone,
        user: {
          create: {
            email: input.email,
            passwordHash,
            firstName: input.firstName,
            lastName: input.lastName,
            role: UserRole.DEVELOPER
          }
        }
      },
      include: { user: { select: { email: true, firstName: true, lastName: true } } }
    });
    response.status(201).json({ developer });
  } catch (error) {
    next(error);
  }
});
