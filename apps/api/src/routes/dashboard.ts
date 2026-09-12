import { ReportPeriod, UserRole } from "@prisma/client";
import { Router } from "express";
import { buildDashboardSummary, sevenDayWindow, yesterdayInTimeZone } from "../lib/dashboard-summary.js";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/authenticate.js";

export const dashboardRouter = Router();
dashboardRouter.use(authenticate);

dashboardRouter.get("/summary", async (_request, response, next) => {
  try {
    const yesterday = yesterdayInTimeZone();
    const firstDate = new Date(`${sevenDayWindow(yesterday)[0]}T00:00:00.000Z`);
    const developers = await prisma.developer.findMany({
      where: { user: { role: UserRole.DEVELOPER, isActive: true } },
      orderBy: { user: { firstName: "asc" } },
      select: {
        id: true,
        jobTitle: true,
        specialty: true,
        user: { select: { firstName: true, lastName: true } },
        statusReports: {
          where: {
            reportDate: { gte: firstDate, lte: yesterday },
            tasks: { some: { period: ReportPeriod.TODAY } }
          },
          select: {
            reportDate: true,
            tasks: {
              where: { period: ReportPeriod.TODAY },
              select: {
                durationMinutes: true,
                projectName: true,
                project: { select: { id: true, name: true } }
              }
            }
          }
        }
      }
    });

    response.json({ summary: buildDashboardSummary(developers, yesterday) });
  } catch (error) {
    next(error);
  }
});
