import { describe, expect, it } from "vitest";
import { parseDiscordStatus, parseDiscordStatuses } from "../src/integrations/discord/status-parser.js";

describe("Discord daily status parser", () => {
  it("imports only Today tasks from the standard format", () => {
    const result = parseDiscordStatus(`09/09/2026
Yesterday:
HomeliCare
Audit ActionCable configuration — 2h
Today:
HomeliCare
Add Download PDF Functionality — 2h
Task: https://app.clickup.com/t/42060460/86eypw2vh
BE-4 — Re-enable Pundit Authorization — 3h
Task: https://app.clickup.com/t/42060460/86eyu17hf [WIP]`);

    expect(result?.reportDateIso).toBe("2026-09-09");
    expect(result?.tasks).toHaveLength(2);
    expect(result?.tasks[0]).toMatchObject({
      period: "TODAY",
      projectName: "HomeliCare",
      description: "Add Download PDF Functionality",
      durationMinutes: 120,
      taskUrl: "https://app.clickup.com/t/42060460/86eypw2vh"
    });
    expect(result?.tasks[1]).toMatchObject({ durationMinutes: 180, taskUrl: "https://app.clickup.com/t/42060460/86eyu17hf" });
    expect(result?.tasks.every((task) => !("status" in task))).toBe(true);
  });

  it("parses parenthesized hours and inherits a heading ticket link", () => {
    const result = parseDiscordStatus(`11/09/2026  Today:
EasyRinger [Upgrade Rails 6.0 to 7.x](https://trello.com/c/bd9ZAhjT/653-upgrade-rails-60-to-7x) [DONE]
- Deployed final working to staging and tested multiple times (1hr)
- Flagged an esbuild eval() warning and traced the handler (1hr)
- Live tested staging over HTTP and asked the client to review the PR (1hr)
EasyRinger [Mobile App Implementation](https://trello.com/c/VcRMJgBG/686-mobile-app-implementation) [WIP]
- Reviewed the plan and manager UI mockups (2hr)`);

    expect(result?.tasks.map((task) => task.durationMinutes)).toEqual([60, 60, 60, 120]);
    expect(result?.tasks.map((task) => task.projectName)).toEqual(["EasyRinger", "EasyRinger", "EasyRinger", "EasyRinger"]);
    expect(result?.tasks[0].taskUrl).toContain("bd9ZAhjT");
    expect(result?.tasks[3].taskUrl).toContain("VcRMJgBG");
  });

  it("parses multiple dated reports and project headings in one message", () => {
    const results = parseDiscordStatuses(`1. 8/09/2026: Yesterday: COHABIT:
- Previous work - 1h
Today: Cohabit:
- Worked on production sanity and ran an initial setup script - 1h
Lightning:
- Worked on UI improvements and moved SO and PO to background jobs - 4h
2. 09/09/2026: Yesterday: Cohabit:
- Previous work - 1h
Today: Cohabit:
- Worked on COHABIT-1087, a secured endpoint for insurance claims - 4h
Lightening:
- Worked on handling and testing the app for 504 errors - 3h`);

    expect(results.map((report) => report.reportDateIso)).toEqual(["2026-09-08", "2026-09-09"]);
    expect(results[0].tasks.map((task) => [task.projectName, task.durationMinutes])).toEqual([["Cohabit", 60], ["Lightning", 240]]);
    expect(results[1].tasks.map((task) => [task.projectName, task.durationMinutes])).toEqual([["Cohabit", 240], ["Lightening", 180]]);
  });

  it("supports hour and minute word variants", () => {
    const result = parseDiscordStatus(`4/09/2026
Yesterday:
Gritchi:
reviewed an email - 30 mins
Today:
Soulartists:
Investigated the website bug — 4 hrs
Fixed the SSL refresh issue — 1 hour`);

    expect(result?.tasks.map((task) => task.durationMinutes)).toEqual([240, 60]);
  });

  it("keeps inline tasks without projects, duration, or ticket links", () => {
    const result = parseDiscordStatus(`**09/09/2026**  **Yesterday:** Contacted Apple support.  **Today:** Contact with Apple support and share the recordings. Currently no active ticket.  Learning Ruby on Rails`);

    expect(result?.tasks).toHaveLength(2);
    expect(result?.tasks[0]).toMatchObject({ projectName: null, durationMinutes: null, taskUrl: null });
    expect(result?.tasks[1].description).toBe("Learning Ruby on Rails");
  });

  it("parses inline ClickUp links and tasks without hours", () => {
    const result = parseDiscordStatus(`9/09/2026
Yesterday: CAA:
- old task - 3 hours
Today: CAA:
- created project repo, added essential gems and other setup - 2 hours[https://app.clickup.com/t/42060460/z8q7hb7j6p](https://app.clickup.com/t/42060460/z8q7hb7j6p)
* started exploring Salesforce API docs`);

    expect(result?.tasks).toHaveLength(2);
    expect(result?.tasks[0]).toMatchObject({ projectName: "CAA", durationMinutes: 120, taskUrl: "https://app.clickup.com/t/42060460/z8q7hb7j6p" });
    expect(result?.tasks[1]).toMatchObject({ description: "started exploring Salesforce API docs", durationMinutes: null, taskUrl: null });
  });

  it("handles a date-only QA update with multiple inline projects", () => {
    const result = parseDiscordStatus(`8/09/26 homelicare Tested the APK for Attendance, Chat, and Notifications. [https://app.clickup.com/t/42060460/z8q7hb66xq](https://app.clickup.com/t/42060460/z8q7hb66xq) [https://app.clickup.com/t/42060460/86eytm7jh](https://app.clickup.com/t/42060460/86eytm7jh) Lightening Tested the complete PO flow end-to-end. Discussed concerns with Burhan. [https://app.clickup.com/t/42060460/z8q7hb676z](https://app.clickup.com/t/42060460/z8q7hb676z)`);

    expect(result?.reportDateIso).toBe("2026-09-08");
    expect(result?.tasks).toHaveLength(2);
    expect(result?.tasks[0]).toMatchObject({ projectName: "homelicare", taskUrl: "https://app.clickup.com/t/42060460/z8q7hb66xq" });
    expect(result?.tasks[1]).toMatchObject({ projectName: "Lightening", taskUrl: "https://app.clickup.com/t/42060460/z8q7hb676z" });
  });

  it("parses a complete one-line Today update", () => {
    const result = parseDiscordStatus(`11/09/2026  Yesterday: HomeliCare  Old work — 2h  Today: HomeliCare  Prevent public pages from being indexed — 2h [DONE] Task: [https://app.clickup.com/t/42060460/z8q7hb7a07](https://app.clickup.com/t/42060460/z8q7hb7a07)  Fix unnecessary authentication requests — 1h [DONE] Task: [https://app.clickup.com/t/42060460/z8q7hb7gt2](https://app.clickup.com/t/42060460/z8q7hb7gt2)  Internationalization and terminology — 3h [WIP] Task: [https://app.clickup.com/t/42060460/86ey4c3vp](https://app.clickup.com/t/42060460/86ey4c3vp)`);

    expect(result?.tasks.map((task) => task.durationMinutes)).toEqual([120, 60, 180]);
    expect(result?.tasks.map((task) => task.taskUrl)).toEqual([
      "https://app.clickup.com/t/42060460/z8q7hb7a07",
      "https://app.clickup.com/t/42060460/z8q7hb7gt2",
      "https://app.clickup.com/t/42060460/86ey4c3vp"
    ]);
  });

  it("ignores leave notices and messages without a dated status", () => {
    expect(parseDiscordStatus(`i was on leave on "7/09/2026"`)).toBeNull();
    expect(parseDiscordStatus("Thanks, I will check it today.")).toBeNull();
  });
});
