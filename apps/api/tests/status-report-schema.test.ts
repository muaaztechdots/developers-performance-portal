import { describe, expect, it } from "vitest";
import { statusReportInputSchema } from "../src/routes/status-reports.js";

describe("status report input", () => {
  it("accepts task rows with nullable duration and URL", () => {
    const parsed = statusReportInputSchema.parse({
      developerId: "80994d92-7bb8-4f6e-911f-5dcbe1fae655",
      reportDate: "2026-09-09",
      tasks: [
        {
          period: "YESTERDAY",
          projectName: "HomeliCare",
          description: "Discussed and updated assessment validations",
          durationMinutes: null,
          taskUrl: null
        }
      ]
    });

    expect(parsed.tasks[0].durationMinutes).toBeNull();
    expect(parsed.submit).toBe(false);
  });

  it("rejects an invalid task URL", () => {
    const result = statusReportInputSchema.safeParse({
      developerId: "80994d92-7bb8-4f6e-911f-5dcbe1fae655",
      reportDate: "2026-09-09",
      tasks: [{ period: "TODAY", description: "Ship PDF", taskUrl: "not-a-url" }]
    });
    expect(result.success).toBe(false);
  });
});
