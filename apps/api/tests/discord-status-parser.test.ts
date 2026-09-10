import { describe, expect, it } from "vitest";
import { parseDiscordStatus } from "../src/integrations/discord/status-parser.js";

const example = `09/09/2026
Yesterday:
HomeliCare
BE-3 — Audit Environment-Specific ActionCable Configuration — 2h
Task: [https://app.clickup.com/t/42060460/86eyu00kx](https://app.clickup.com/t/42060460/86eyu00kx)
Implement Audit Log Activity/History Details — 2h
Task: https://app.clickup.com/t/42060460/86eypkq8q
Add Export PDF Functionality to Global Audit Logs — 2h
Task: https://app.clickup.com/t/42060460/86eypvnc7
Discussed and updated assessment validations — 1h
Today:
HomeliCare
Add Download PDF Functionality to Global Audit Logs — 2h
Task: https://app.clickup.com/t/42060460/86eypw2vh
BE-4 — Re-enable Pundit Authorization — 3h
Task: https://app.clickup.com/t/42060460/86eyu17hf [WIP]`;

describe("Discord daily status parser", () => {
  it("parses the supplied Yesterday/Today format", () => {
    const result = parseDiscordStatus(example);

    expect(result?.reportDateIso).toBe("2026-09-09");
    expect(result?.tasks).toHaveLength(6);
    expect(result?.tasks[0]).toMatchObject({
      period: "YESTERDAY",
      projectName: "HomeliCare",
      description: "BE-3 — Audit Environment-Specific ActionCable Configuration",
      durationMinutes: 120,
      status: "COMPLETED",
      taskUrl: "https://app.clickup.com/t/42060460/86eyu00kx"
    });
    expect(result?.tasks.at(-1)).toMatchObject({
      period: "TODAY",
      durationMinutes: 180,
      status: "IN_PROGRESS",
      taskUrl: "https://app.clickup.com/t/42060460/86eyu17hf"
    });
  });

  it("supports minute and decimal-hour durations", () => {
    const result = parseDiscordStatus("10/09/2026\nToday:\nPlatform\nFix pipeline — 1.5h\nReview PR — 30m [WIP]");
    expect(result?.tasks.map((task) => task.durationMinutes)).toEqual([90, 30]);
  });

  it("ignores messages without a dated status", () => {
    expect(parseDiscordStatus("Thanks, I will check it today.")).toBeNull();
  });
});
