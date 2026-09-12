import { ReportPeriod, UserRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { buildPerformanceReport } from "../lib/report-summary.js";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/authenticate.js";

export const reportsRouter = Router();
reportsRouter.use(authenticate);

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const reportQuerySchema = z.object({
  developerId: z.uuid().optional(),
  date: z.iso.date().optional(),
  month: monthSchema.optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional()
}).superRefine((value, context) => {
  const periodTypes = Number(Boolean(value.date)) + Number(Boolean(value.month)) + Number(Boolean(value.from || value.to));
  if (periodTypes > 1) context.addIssue({ code: "custom", message: "Choose one date filter." });
  if (Boolean(value.from) !== Boolean(value.to)) context.addIssue({ code: "custom", message: "Both from and to dates are required." });
  if (value.from && value.to && value.from > value.to) context.addIssue({ code: "custom", message: "From date must not be after to date." });
});

function dateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function currentMonthInPakistan() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit"
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}`;
}

function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const from = new Date(Date.UTC(year, monthNumber - 1, 1));
  const to = new Date(Date.UTC(year, monthNumber, 0));
  return { from, to };
}

reportsRouter.get("/", async (request, response, next) => {
  try {
    const query = reportQuerySchema.parse(request.query);
    const hasCustomRange = Boolean(query.from && query.to);
    const selectedMonth = query.month ?? (!query.date && !hasCustomRange ? currentMonthInPakistan() : null);
    const range = query.date
      ? { from: dateOnly(query.date), to: dateOnly(query.date) }
      : hasCustomRange
        ? { from: dateOnly(query.from!), to: dateOnly(query.to!) }
        : monthRange(selectedMonth!);

    let developerId = query.developerId;
    if (request.session!.role !== UserRole.ADMIN) {
      const ownDeveloper = await prisma.developer.findUnique({
        where: { userId: request.session!.sub },
        select: { id: true }
      });
      if (!ownDeveloper) {
        response.status(403).json({ message: "Developer profile required." });
        return;
      }
      developerId = ownDeveloper.id;
    } else if (developerId) {
      const developerExists = await prisma.developer.findFirst({
        where: { id: developerId, user: { role: UserRole.DEVELOPER } },
        select: { id: true }
      });
      if (!developerExists) {
        response.status(404).json({ message: "Developer not found." });
        return;
      }
    }

    const reports = await prisma.statusReport.findMany({
      where: {
        developerId,
        developer: { user: { role: UserRole.DEVELOPER } },
        reportDate: { gte: range.from, lte: range.to },
        tasks: { some: { period: ReportPeriod.TODAY } }
      },
      orderBy: [{ reportDate: "desc" }, { developer: { user: { firstName: "asc" } } }],
      select: {
        id: true,
        reportDate: true,
        developer: {
          select: {
            id: true,
            specialty: true,
            user: { select: { firstName: true, lastName: true } }
          }
        },
        tasks: {
          where: { period: ReportPeriod.TODAY },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            description: true,
            durationMinutes: true,
            taskUrl: true,
            projectName: true,
            project: { select: { id: true, name: true } }
          }
        }
      }
    });

    response.json({
      report: {
        filters: {
          developerId: developerId ?? null,
          mode: query.date ? "date" : hasCustomRange ? "range" : "month",
          date: query.date ?? null,
          month: selectedMonth,
          from: range.from.toISOString().slice(0, 10),
          to: range.to.toISOString().slice(0, 10)
        },
        ...buildPerformanceReport(reports, range.from, range.to)
      }
    });
  } catch (error) {
    next(error);
  }
});
