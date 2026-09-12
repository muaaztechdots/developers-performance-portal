import { describe, expect, it } from "vitest";
import { buildPerformanceReport, type PerformanceReportRow } from "../src/lib/report-summary.js";
import { reportQuerySchema } from "../src/routes/reports.js";

const rows: PerformanceReportRow[] = [{
  id: "report-1",
  reportDate: new Date("2026-09-10T00:00:00.000Z"),
  developer: {
    id: "developer-1",
    specialty: "ENGINEERING",
    user: { firstName: "Ahsan", lastName: "Dev" }
  },
  tasks: [
    { id: "task-1", description: "Build API", durationMinutes: 120, taskUrl: "https://app.clickup.com/t/1", projectName: "HomeliCare", project: { id: "project-1", name: "HomeliCare" } },
    { id: "task-2", description: "Team discussion", durationMinutes: null, taskUrl: null, projectName: null, project: null }
  ]
}];

describe("buildPerformanceReport", () => {
  it("calculates totals and coverage", () => {
    const result = buildPerformanceReport(rows, new Date("2026-09-10T00:00:00.000Z"), new Date("2026-09-10T00:00:00.000Z"));
    expect(result.stats).toMatchObject({
      statusDays: 1,
      taskCount: 2,
      totalMinutes: 120,
      averageMinutesPerStatusDay: 120,
      ticketCoveragePercent: 50,
      projectCoveragePercent: 50,
      timeCoveragePercent: 50
    });
  });

  it("includes empty dates in the daily series", () => {
    const result = buildPerformanceReport(rows, new Date("2026-09-09T00:00:00.000Z"), new Date("2026-09-11T00:00:00.000Z"));
    expect(result.dailyActivity.map((day) => [day.date, day.reportedMinutes])).toEqual([
      ["2026-09-09", 0],
      ["2026-09-10", 120],
      ["2026-09-11", 0]
    ]);
  });

  it("groups assigned and unassigned work separately", () => {
    const result = buildPerformanceReport(rows, new Date("2026-09-10T00:00:00.000Z"), new Date("2026-09-10T00:00:00.000Z"));
    expect(result.projectBreakdown.map((project) => [project.name, project.taskCount])).toEqual([
      ["HomeliCare", 1],
      ["Unassigned", 1]
    ]);
  });
});

describe("reportQuerySchema", () => {
  it("accepts a month, a specific date, or a complete date range", () => {
    expect(reportQuerySchema.parse({ month: "2026-09" })).toEqual({ month: "2026-09" });
    expect(reportQuerySchema.parse({ date: "2026-09-12" })).toEqual({ date: "2026-09-12" });
    expect(reportQuerySchema.parse({ from: "2026-09-01", to: "2026-09-07" })).toEqual({ from: "2026-09-01", to: "2026-09-07" });
  });

  it("rejects conflicting or malformed periods", () => {
    expect(() => reportQuerySchema.parse({ month: "2026-13" })).toThrow();
    expect(() => reportQuerySchema.parse({ month: "2026-09", date: "2026-09-12" })).toThrow();
    expect(() => reportQuerySchema.parse({ from: "2026-09-01" })).toThrow();
    expect(() => reportQuerySchema.parse({ from: "2026-09-08", to: "2026-09-01" })).toThrow();
  });
});
