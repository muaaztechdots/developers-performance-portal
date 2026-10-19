import { describe, expect, it } from "vitest";
import { parserOptionsForDeveloper } from "../src/integrations/discord/developer-status-format.js";
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

  it("groups bullet details under linked task headings", () => {
    const result = parseDiscordStatus(`11/09/2026  Today:
EasyRinger [Upgrade Rails 6.0 to 7.x](https://trello.com/c/bd9ZAhjT/653-upgrade-rails-60-to-7x) [DONE]
- Deployed final working to staging and tested multiple times (1hr)
- Flagged an esbuild eval() warning and traced the handler (1hr)
- Live tested staging over HTTP and asked the client to review the PR (1hr)
EasyRinger [Mobile App Implementation](https://trello.com/c/VcRMJgBG/686-mobile-app-implementation) [WIP]
- Reviewed the plan and manager UI mockups (2hr)`);

    expect(result?.tasks.map((task) => task.description)).toEqual(["Upgrade Rails 6.0 to 7.x", "Mobile App Implementation"]);
    expect(result?.tasks.map((task) => task.durationMinutes)).toEqual([180, 120]);
    expect(result?.tasks.map((task) => task.projectName)).toEqual(["EasyRinger", "EasyRinger"]);
    expect(result?.tasks[0].taskUrl).toContain("bd9ZAhjT");
    expect(result?.tasks[0].details?.split("\n")).toHaveLength(3);
    expect(result?.tasks[1].taskUrl).toContain("VcRMJgBG");
    expect(result?.tasks[1].details).toContain("Reviewed the plan and manager UI mockups (2hr)");
  });

  it("groups Shakil's bullet details under two-line task headings", () => {
    const result = parseDiscordStatus(`17/09/2026
Today:

EasyRinger
Mobile App Implementation [WIP]

- Built the messages screens (list, thread, compose) plus the controller and US block policy (2hr)
- Wired the Message button and unread count into the home screen (30m)
- Wrote specs, caught a real country lookup bug, and fixed two bad test assertions (1hr10m)
- Loaded the screens in browser and fixed a broken Alpine JSON attribute bug (1h)
- Built the biometric toggle endpoint, hit the schema and DB issues, then flagged a design gap in the rememberable step and checked with the manager (1hr20m)
- Built rememberable properly, hit a Devise quirk that silently drops the naive remember approach (1h30m)
- Wrote specs proving the dashboard stays untouched and mobile remembers correctly, hit the DB issue (40m)

EasyRinger
[Chrome Extension](https://trello.com/c/OzlAjFC5/672-chrome-extension)  [WIP]
- Got rejected, reviewer couldn't connect since develop never got merged down to master and we're pointed at production. Asked client to merge to master. (1h)`);

    expect(result?.reportDateIso).toBe("2026-09-17");
    expect(result?.tasks).toHaveLength(2);
    expect(result?.tasks.map((task) => task.projectName)).toEqual(["EasyRinger", "EasyRinger"]);
    expect(result?.tasks.map((task) => task.description)).toEqual(["Mobile App Implementation", "Chrome Extension"]);
    expect(result?.tasks.map((task) => task.durationMinutes)).toEqual([490, 60]);
    expect(result?.tasks[0].details?.split("\n")).toHaveLength(7);
    expect(result?.tasks[0].details).toContain("Built the messages screens (list, thread, compose) plus the controller and US block policy (2hr)");
    expect(result?.tasks[1].details).toContain("Got rejected, reviewer couldn't connect");
    expect(result?.tasks[1].taskUrl).toBe("https://trello.com/c/OzlAjFC5/672-chrome-extension");
  });

  it("groups bullet details when the task heading has no status marker", () => {
    const result = parseDiscordStatus(`18/09/2026
Today:
Cohabit
Claims API
- Implemented the secured claims endpoint (2h)
- Tested the complete claims flow (30m)`);

    expect(result?.tasks).toHaveLength(1);
    expect(result?.tasks[0]).toMatchObject({
      projectName: "Cohabit",
      description: "Claims API",
      durationMinutes: 150,
      details: "Implemented the secured claims endpoint (2h)\nTested the complete claims flow (30m)"
    });
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

  it("keeps HomeliCare as Ahsan's project and imports only his Today tasks", () => {
    const result = parseDiscordStatus(`01/10/2026

Yesterday:
HomeliCare

Block Access of production on all regions accept UK. [Testing on Prod, Staging] —  2h [DONE]
Task: https://app.clickup.com/t/42060460/z8q7hbdh1n

Fix offline assessment sync conflicts and refresh online visit contexts[Tested on Prod, Staging] —  3h [DONE]
Task: https://app.clickup.com/t/42060460/z8q7hbdu6m

[BE] Investigate disabled conflict/double-booking detection —  1h [WIP]
Task: https://app.clickup.com/t/42060460/z8q7hbdhpr

Today:
HomeliCare

[BE] Investigate disabled conflict/double-booking detection —  2h [DONE]
Task: https://app.clickup.com/t/42060460/z8q7hbdhpr

[BE] Re-enable conflict/double-booking detection —  1h [DONE]
Task: https://app.clickup.com/t/42060460/z8q7hbdhpr

[Backend] Persist per-event location and device evidence on check-in/out — 30min [DONE]
Task: https://app.clickup.com/t/42060460/z8q7hbetcf

[Backend] Record location and geofence evidence on assessment submission— 1h [DONE]
Task: https://app.clickup.com/t/42060460/z8q7hbetcg`);

    expect(result?.reportDateIso).toBe("2026-10-01");
    expect(result?.tasks).toHaveLength(4);
    expect(result?.tasks.map((task) => task.projectName)).toEqual([
      "HomeliCare",
      "HomeliCare",
      "HomeliCare",
      "HomeliCare"
    ]);
    expect(result?.tasks.map((task) => task.description)).toEqual([
      "[BE] Investigate disabled conflict/double-booking detection",
      "[BE] Re-enable conflict/double-booking detection",
      "[Backend] Persist per-event location and device evidence on check-in/out",
      "[Backend] Record location and geofence evidence on assessment submission"
    ]);
    expect(result?.tasks.map((task) => task.durationMinutes)).toEqual([120, 60, 30, 60]);
    expect(result?.tasks.map((task) => task.taskUrl)).toEqual([
      "https://app.clickup.com/t/42060460/z8q7hbdhpr",
      "https://app.clickup.com/t/42060460/z8q7hbdhpr",
      "https://app.clickup.com/t/42060460/z8q7hbetcf",
      "https://app.clickup.com/t/42060460/z8q7hbetcg"
    ]);
  });

  it("groups plain detail lines under tasks in the bot-generated status format", () => {
    const result = parseDiscordStatus(`02/10/2026

Today:

HomeliCare
Task 1 (2h)
done this
this
and this

HomeliCare
task 2 (3h)
done this this
this this`);

    expect(result?.reportDateIso).toBe("2026-10-02");
    expect(result?.tasks).toHaveLength(2);
    expect(result?.tasks).toEqual([
      expect.objectContaining({
        projectName: "HomeliCare",
        description: "Task 1",
        details: "done this\nthis\nand this",
        durationMinutes: 120,
        taskUrl: null,
        sortOrder: 0
      }),
      expect.objectContaining({
        projectName: "HomeliCare",
        description: "task 2",
        details: "done this this\nthis this",
        durationMinutes: 180,
        taskUrl: null,
        sortOrder: 1
      })
    ]);
  });

  it("groups Sadaf's title, description, ClickUp ticket label, and link blocks", () => {
    const result = parseDiscordStatus(`09/10/26
homelicare
today
Production Deployment: Reviewed the ticket for combining six branches into deploy/prod-8oct for a single PR into main and verified the related QA feedback.

Combined six branches into deploy/prod-8oct for a single PR into main
https://app.clickup.com/t/42060460/z8q7hbgmjt

Rejected Geofence Attempts: Reviewed the backend changes for persisting rejected geofence attempts and displaying geofence validation results on the visit timeline.

[BE] Persist rejected geofence attempts and show geofence results on the visit timeline
https://app.clickup.com/t/42060460/z8q7hbdhpf

Mobile Attendance Location Handling: Reviewed the check-in and check-out location handling changes and verified the related QA feedback.

[Mobile] Location handling at attendance check-in and check-out
https://app.clickup.com/t/42060460/z8q7hbdhpm

Geofence Enforcement: Reviewed the backend changes for enabling geofence enforcement by default and flagging visits with missing location data.

[BE] Geofence enforcement on by default, and flag visits with no location
https://app.clickup.com/t/42060460/z8q7hbdhpj

QA Feedback Review: Verified the feedback provided by Talha, reviewed the reported issues, and moved tickets back to QA that require separate handling and verification.`);

    expect(result?.reportDateIso).toBe("2026-10-09");
    expect(result?.tasks).toEqual([
      expect.objectContaining({
        projectName: "homelicare",
        description: "Production Deployment",
        details: "Reviewed the ticket for combining six branches into deploy/prod-8oct for a single PR into main and verified the related QA feedback.",
        durationMinutes: null,
        taskUrl: "https://app.clickup.com/t/42060460/z8q7hbgmjt",
        sortOrder: 0
      }),
      expect.objectContaining({
        projectName: "homelicare",
        description: "Rejected Geofence Attempts",
        details: "Reviewed the backend changes for persisting rejected geofence attempts and displaying geofence validation results on the visit timeline.",
        durationMinutes: null,
        taskUrl: "https://app.clickup.com/t/42060460/z8q7hbdhpf",
        sortOrder: 1
      }),
      expect.objectContaining({
        projectName: "homelicare",
        description: "Mobile Attendance Location Handling",
        details: "Reviewed the check-in and check-out location handling changes and verified the related QA feedback.",
        durationMinutes: null,
        taskUrl: "https://app.clickup.com/t/42060460/z8q7hbdhpm",
        sortOrder: 2
      }),
      expect.objectContaining({
        projectName: "homelicare",
        description: "Geofence Enforcement",
        details: "Reviewed the backend changes for enabling geofence enforcement by default and flagging visits with missing location data.",
        durationMinutes: null,
        taskUrl: "https://app.clickup.com/t/42060460/z8q7hbdhpj",
        sortOrder: 3
      }),
      expect.objectContaining({
        projectName: "homelicare",
        description: "QA Feedback Review",
        details: "Verified the feedback provided by Talha, reviewed the reported issues, and moved tickets back to QA that require separate handling and verification.",
        durationMinutes: null,
        taskUrl: null,
        sortOrder: 4
      })
    ]);
  });

  it("parses Nimra's written date and optional-link task lines", () => {
    const result = parseDiscordStatus(`Date: October 16, 2026
Today:
Homeli Care

Completed the requested review changes on the Unread Messages PR -2h
Completed the requested review changes on the Error Messages PR and added test cases. - 2h`);

    expect(result?.reportDateIso).toBe("2026-10-16");
    expect(result?.tasks).toEqual([
      expect.objectContaining({
        projectName: "Homeli Care",
        description: "Completed the requested review changes on the Unread Messages PR",
        details: null,
        durationMinutes: 120,
        taskUrl: null,
        sortOrder: 0
      }),
      expect.objectContaining({
        projectName: "Homeli Care",
        description: "Completed the requested review changes on the Error Messages PR and added test cases.",
        details: null,
        durationMinutes: 120,
        taskUrl: null,
        sortOrder: 1
      })
    ]);
  });

  it("sums Shakil's unbulleted subtask durations under the parent task", () => {
    const result = parseDiscordStatus(`6/10/2026
Today:
EasyRinger
Mobile App Implementation [WIP]
Ruled out a push credential per number, wrote the er-ops-voice change, checked prod (about 90% have one Twilio number) and kept the default. Fixed Unknown number in Recent caused by a stored leading + (1hr30m)
Unregister on sign out: sign out waits for native to unregister every number, and a signed out phone ignores calls. Drawer spec (1hr)
Staging test: sped up sign out and blocked repeat taps. Registrations raced, so the app now registers only the newest number (1hr)
Retested sign out and sign in on staging, then planned ConnectionService: Core-Telecom chosen, dial screen hang up rule dropped (1hr)
Built it: calls run inside telecom, ongoing call service and notification, hold, speaker routes (1hr30m)
Fixed an answer crash, emulator tests passed (background, locked, notification, hang up, outgoing), built the staging APK, ruled out an er-web fix and wrote the client messages with the er-ops-voice code request (2hr)`);

    expect(result?.reportDateIso).toBe("2026-10-06");
    expect(result?.tasks).toHaveLength(1);
    expect(result?.tasks[0]).toMatchObject({
      projectName: "EasyRinger",
      description: "Mobile App Implementation",
      durationMinutes: 480,
      taskUrl: null,
      sortOrder: 0
    });
    expect(result?.tasks[0].details?.split("\n")).toEqual([
      "Ruled out a push credential per number, wrote the er-ops-voice change, checked prod (about 90% have one Twilio number) and kept the default. Fixed Unknown number in Recent caused by a stored leading + (1hr30m)",
      "Unregister on sign out: sign out waits for native to unregister every number, and a signed out phone ignores calls. Drawer spec (1hr)",
      "Staging test: sped up sign out and blocked repeat taps. Registrations raced, so the app now registers only the newest number (1hr)",
      "Retested sign out and sign in on staging, then planned ConnectionService: Core-Telecom chosen, dial screen hang up rule dropped (1hr)",
      "Built it: calls run inside telecom, ongoing call service and notification, hold, speaker routes (1hr30m)",
      "Fixed an answer crash, emulator tests passed (background, locked, notification, hang up, outgoing), built the staging APK, ruled out an er-web fix and wrote the client messages with the er-ops-voice code request (2hr)"
    ]);
  });

  it("parses Burhan's encoded Lightning bullet format", () => {
    const parserOptions = parserOptionsForDeveloper({ firstName: "Burhan" });
    const result = parseDiscordStatus(`7/10/2026:

Today:&#x20;

Lightning:&#x20;

- Worked on resolving issues found while testing the inventory usage for purchase order creation workflow, the issue precisely was that the receipt entry for the inventory usage resulted in a error while approving the parts/material as received. Furthermore, continued working on resolving issues during inspection. looked into epicor to resolve it, it is still in progress, we'll have to work on its resolution for non-conformance, DMR, and production readiness - 4h
- Worked on UI improvements for the PO screen, worked on making UI flow more user friendly - 2h`, parserOptions);

    expect(result?.reportDateIso).toBe("2026-10-07");
    expect(result?.tasks).toHaveLength(2);
    expect(result?.tasks[0]).toMatchObject({
      projectName: "Lightning",
      durationMinutes: 240,
      taskUrl: null,
      sortOrder: 0
    });
    expect(result?.tasks[0].description).toContain("Worked on resolving issues found while testing the inventory usage");
    expect(result?.tasks[1]).toMatchObject({
      projectName: "Lightning",
      description: "Worked on UI improvements for the PO screen, worked on making UI flow more user friendly",
      durationMinutes: 120,
      taskUrl: null,
      sortOrder: 1
    });

    const missingProject = parseDiscordStatus(`8/10/2026
Today:
- Worked on the purchase order workflow - 3h`, parserOptions);
    expect(missingProject?.tasks[0]).toMatchObject({
      projectName: "Lightening",
      description: "Worked on the purchase order workflow",
      durationMinutes: 180
    });
    expect(parserOptionsForDeveloper({ firstName: "Nimra" })).toEqual({});
  });

  it("parses Ahsan and Zeeshan's shared task-and-link format", () => {
    const result = parseDiscordStatus(`16/10/2026

Today:
HomeliCare Mob App

[Mobile] Send a reason when location is unavailable during check-in/out — 30m [DONE]
Task: https://app.clickup.com/t/42060460/z8q7hbj698

[Mobile] Prevent stale location fallback and remove obsolete assessment screen — 1h [DONE]
Task: https://app.clickup.com/t/42060460/z8q7hbj6ya

[iOS] Update App Store Listing Copy — 20m [DONE]
Task: https://app.clickup.com/t/42060460/z8q7hbjev8

[Android] Update Google Play Store Listing Copy — 20m [DONE]
Task: https://app.clickup.com/t/42060460/z8q7hbjeva

[Android] Update Google Play Release Notes — 20m [DONE]
Task: https://app.clickup.com/t/42060460/z8q7hbjevc`);

    expect(result?.reportDateIso).toBe("2026-10-16");
    expect(result?.tasks.map((task) => ({
      projectName: task.projectName,
      description: task.description,
      durationMinutes: task.durationMinutes,
      taskUrl: task.taskUrl
    }))).toEqual([
      {
        projectName: "HomeliCare Mob App",
        description: "[Mobile] Send a reason when location is unavailable during check-in/out",
        durationMinutes: 30,
        taskUrl: "https://app.clickup.com/t/42060460/z8q7hbj698"
      },
      {
        projectName: "HomeliCare Mob App",
        description: "[Mobile] Prevent stale location fallback and remove obsolete assessment screen",
        durationMinutes: 60,
        taskUrl: "https://app.clickup.com/t/42060460/z8q7hbj6ya"
      },
      {
        projectName: "HomeliCare Mob App",
        description: "[iOS] Update App Store Listing Copy",
        durationMinutes: 20,
        taskUrl: "https://app.clickup.com/t/42060460/z8q7hbjev8"
      },
      {
        projectName: "HomeliCare Mob App",
        description: "[Android] Update Google Play Store Listing Copy",
        durationMinutes: 20,
        taskUrl: "https://app.clickup.com/t/42060460/z8q7hbjeva"
      },
      {
        projectName: "HomeliCare Mob App",
        description: "[Android] Update Google Play Release Notes",
        durationMinutes: 20,
        taskUrl: "https://app.clickup.com/t/42060460/z8q7hbjevc"
      }
    ]);
  });

  it("imports only Ramis's Today tasks across multiple projects", () => {
    const result = parseDiscordStatus(`13/10/2026
Yesterday
CAA:
packages page theme aligning - 30mins
properties page theme aligning - 30mins
sign in page change according to figma - 30mins
overall application theme, pagination, logos and color changes - 2h
guided Muawaz for form changes, PR reviews, changes - 30mins

Today:
CAA:
forms version display and preview for diff versions - 45mins
form fields data mapping and attachment with packages, data cascading - 3h
looked into documenso(WIP) - 30mins

OSS -Blogging
created presentation for assigned task - 30mins
 task: https://app.clickup.com/t/42060460/z8q7hbf2ku`);

    expect(result?.reportDateIso).toBe("2026-10-13");
    expect(result?.tasks).toEqual([
      expect.objectContaining({
        projectName: "CAA",
        description: "forms version display and preview for diff versions",
        durationMinutes: 45,
        taskUrl: null,
        sortOrder: 0
      }),
      expect.objectContaining({
        projectName: "CAA",
        description: "form fields data mapping and attachment with packages, data cascading",
        durationMinutes: 180,
        taskUrl: null,
        sortOrder: 1
      }),
      expect.objectContaining({
        projectName: "CAA",
        description: "looked into documenso(WIP)",
        durationMinutes: 30,
        taskUrl: null,
        sortOrder: 2
      }),
      expect.objectContaining({
        projectName: "OSS -Blogging",
        description: "created presentation for assigned task",
        durationMinutes: 30,
        taskUrl: "https://app.clickup.com/t/42060460/z8q7hbf2ku",
        sortOrder: 3
      })
    ]);
    expect(result?.tasks.some((task) => task.description.includes("packages page theme"))).toBe(false);
  });

  it("parses Muawaz's indented decimal-hour task format", () => {
    const result = parseDiscordStatus(`12/10/2026

Today:
  Caa:
     Updated the Forms Library to the new platform theme and kept its read-only preview workflow - 1 hr
     Built the Forms Management listing with pagination, active and archived views, and updated action icons - 1.25 hrs
     Implemented the two-step form creation flow with rich-text editing and a live form preview - 1.5 hrs.
     Added form editing, archive and restore confirmations, and consistent confirmation modal styling - 1 hr
     Implemented the two-step PDF upload flow with PDF text extraction into the form editor - 1.25 hr
     Added reusable merge fields with immediate persistence, search, helper text, duplicate prevention, and form bindings - 1.5hr
     Polished editor and library styling, including upload states, modal sizing, card overflow, icons, and CAA badge colors - 0.5 hr `);

    expect(result?.reportDateIso).toBe("2026-10-12");
    expect(result?.tasks).toHaveLength(7);
    expect(result?.tasks.map((task) => task.projectName)).toEqual(Array(7).fill("Caa"));
    expect(result?.tasks.map((task) => task.durationMinutes)).toEqual([60, 75, 90, 60, 75, 90, 30]);
    expect(result?.tasks.reduce((total, task) => total + (task.durationMinutes ?? 0), 0)).toBe(480);
    expect(result?.tasks.map((task) => task.description)).toEqual([
      "Updated the Forms Library to the new platform theme and kept its read-only preview workflow",
      "Built the Forms Management listing with pagination, active and archived views, and updated action icons",
      "Implemented the two-step form creation flow with rich-text editing and a live form preview",
      "Added form editing, archive and restore confirmations, and consistent confirmation modal styling",
      "Implemented the two-step PDF upload flow with PDF text extraction into the form editor",
      "Added reusable merge fields with immediate persistence, search, helper text, duplicate prevention, and form bindings",
      "Polished editor and library styling, including upload states, modal sizing, card overflow, icons, and CAA badge colors"
    ]);
    expect(result?.tasks.every((task) => task.taskUrl === null)).toBe(true);
  });

  it("ignores leave notices and messages without a dated status", () => {
    expect(parseDiscordStatus(`i was on leave on "7/09/2026"`)).toBeNull();
    expect(parseDiscordStatus("Thanks, I will check it today.")).toBeNull();
  });
});
