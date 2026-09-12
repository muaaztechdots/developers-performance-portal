import { describe, expect, it } from "vitest";
import { buildDashboardSummary, sevenDayWindow, yesterdayInTimeZone } from "../src/lib/dashboard-summary.js";

describe("dashboard summary", () => {
  it("calculates yesterday coverage, reported work, and project activity", () => {
    const summary = buildDashboardSummary([
      {
        id: "developer-1",
        jobTitle: "Backend Engineer",
        specialty: "ENGINEERING",
        user: { firstName: "Ahsan", lastName: "Ali" },
        statusReports: [{
          reportDate: new Date("2026-09-11T00:00:00.000Z"),
          tasks: [
            { durationMinutes: 120, projectName: "HomeliCare", project: { id: "project-1", name: "HomeliCare" } },
            { durationMinutes: 60, projectName: "HomeliCare", project: { id: "project-1", name: "HomeliCare" } }
          ]
        }]
      },
      {
        id: "developer-2",
        jobTitle: "QA Engineer",
        specialty: "QA",
        user: { firstName: "Sadaf", lastName: "" },
        statusReports: []
      }
    ], new Date("2026-09-11T00:00:00.000Z"));

    expect(summary.team).toEqual({ total: 2, engineering: 1, qa: 1 });
    expect(summary.yesterday).toEqual({ submitted: 1, missing: 1, coveragePercent: 50, taskCount: 2, reportedMinutes: 180 });
    expect(summary.developerStatuses[0]).toMatchObject({ name: "Sadaf", submitted: false });
    expect(summary.projectActivity[0]).toMatchObject({ name: "HomeliCare", taskCount: 2, reportedMinutes: 180 });
  });

  it("does not count weekend days as missing", () => {
    const summary = buildDashboardSummary([{
      id: "developer-1",
      jobTitle: null,
      specialty: "ENGINEERING",
      user: { firstName: "Dev", lastName: "" },
      statusReports: []
    }], new Date("2026-09-06T00:00:00.000Z"));

    expect(summary.yesterdayIsWeekend).toBe(true);
    expect(summary.yesterday).toMatchObject({ submitted: 0, missing: 0, coveragePercent: null });
  });

  it("builds dates using the Pakistan calendar", () => {
    expect(yesterdayInTimeZone("Asia/Karachi", new Date("2026-09-12T20:30:00.000Z")).toISOString().slice(0, 10)).toBe("2026-09-12");
    expect(sevenDayWindow(new Date("2026-09-11T00:00:00.000Z"))).toEqual([
      "2026-09-05", "2026-09-06", "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11"
    ]);
  });
});
