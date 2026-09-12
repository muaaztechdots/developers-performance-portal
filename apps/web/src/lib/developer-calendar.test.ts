import { describe, expect, it } from "vitest";
import { buildDeveloperCalendar, todayInPakistan, yesterdayInPakistan } from "./developer-calendar";

describe("buildDeveloperCalendar", () => {
  it("fills every date through yesterday and identifies weekends", () => {
    expect(buildDeveloperCalendar(["2026-09-04T00:00:00.000Z"], "2026-09-07")).toEqual([
      { date: "2026-09-07", isWeekend: false },
      { date: "2026-09-06", isWeekend: true },
      { date: "2026-09-05", isWeekend: true },
      { date: "2026-09-04", isWeekend: false }
    ]);
  });

  it("shows yesterday when the developer has no imported reports", () => {
    expect(buildDeveloperCalendar([], "2026-09-11")).toEqual([
      { date: "2026-09-11", isWeekend: false }
    ]);
  });

  it("ignores future reports when choosing the start of the timeline", () => {
    expect(buildDeveloperCalendar(["2026-09-15T00:00:00.000Z"], "2026-09-11")).toEqual([
      { date: "2026-09-11", isWeekend: false }
    ]);
  });
});

describe("yesterdayInPakistan", () => {
  it("uses the Pakistan calendar date", () => {
    expect(todayInPakistan(new Date("2026-09-12T20:30:00.000Z"))).toBe("2026-09-13");
    expect(yesterdayInPakistan(new Date("2026-09-12T20:30:00.000Z"))).toBe("2026-09-12");
  });
});
