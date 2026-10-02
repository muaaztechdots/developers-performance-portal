import { describe, expect, it } from "vitest";
import { parseDiscordStatus } from "../src/integrations/discord/status-parser.js";
import {
  dateInTimeZone,
  normalizeStatusDetails,
  normalizeStatusUrl,
  parseSubmittedDuration,
  renderDiscordStatusSubmission
} from "../src/integrations/discord/status-submission.js";

describe("Discord status submissions", () => {
  it("validates the supported total-time formats", () => {
    expect(parseSubmittedDuration("2h")).toBe(120);
    expect(parseSubmittedDuration("1h 30m")).toBe(90);
    expect(parseSubmittedDuration("45 min")).toBe(45);
    expect(parseSubmittedDuration("1:30")).toBeNull();
    expect(parseSubmittedDuration("25h")).toBeNull();
  });

  it("normalizes multiline details and optional links", () => {
    expect(normalizeStatusDetails("- Built the screen\n* Fixed tests\n\n3. Opened PR")).toBe(
      "Built the screen\nFixed tests\nOpened PR"
    );
    expect(normalizeStatusUrl("https://app.clickup.com/t/abc")).toBe("https://app.clickup.com/t/abc");
    expect(normalizeStatusUrl("not a link")).toBeNull();
  });

  it("uses the developer timezone for the report date", () => {
    expect(dateInTimeZone(new Date("2026-09-30T20:30:00.000Z"), "Asia/Karachi").toISOString()).toBe(
      "2026-10-01T00:00:00.000Z"
    );
  });

  it("renders one canonical message that the existing parser imports correctly", () => {
    const content = renderDiscordStatusSubmission(new Date("2026-10-01T00:00:00.000Z"), [
      {
        projectName: "EasyRinger",
        description: "Mobile App Implementation",
        details: "Built the message screen\nFixed the unread counter",
        durationMinutes: 150,
        taskUrl: "https://app.clickup.com/t/abc",
        pullRequestUrl: "https://github.com/example/easyringer/pull/42"
      },
      {
        projectName: "Internal Dashboard",
        description: "Status bot",
        details: "",
        durationMinutes: 45,
        taskUrl: null
      }
    ]);

    const parsed = parseDiscordStatus(content);
    expect(parsed?.reportDateIso).toBe("2026-10-01");
    expect(parsed?.tasks).toHaveLength(2);
    expect(parsed?.tasks[0]).toMatchObject({
      projectName: "EasyRinger",
      description: "Mobile App Implementation",
      details: "Built the message screen\nFixed the unread counter\nPR: https://github.com/example/easyringer/pull/42",
      durationMinutes: 150,
      taskUrl: "https://app.clickup.com/t/abc"
    });
    expect(parsed?.tasks[1]).toMatchObject({
      projectName: "Internal Dashboard",
      description: "Status bot",
      details: null,
      durationMinutes: 45
    });
  });
});
