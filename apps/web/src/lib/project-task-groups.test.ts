import { describe, expect, it } from "vitest";
import { groupProjectTasks, type ProjectTask } from "./project-task-groups";

function task(id: string, description: string, durationMinutes: number | null, date: string, developerId = "developer-1"): ProjectTask {
  return {
    id,
    description,
    details: null,
    durationMinutes,
    taskUrl: null,
    statusReport: {
      reportDate: date,
      developer: { id: developerId, user: { firstName: developerId === "developer-1" ? "Shakil" : "Sadaf", lastName: "" } }
    }
  };
}

describe("groupProjectTasks", () => {
  it("groups normalized task titles and totals their reported minutes", () => {
    const groups = groupProjectTasks([
      task("1", "Mobile App Implementation", 490, "2026-09-17"),
      task("2", " mobile   app implementation ", 210, "2026-09-16"),
      task("3", "Chrome Extension", 60, "2026-09-17", "developer-2")
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      description: "Mobile App Implementation",
      totalMinutes: 700,
      timedEntryCount: 2,
      latestDate: "2026-09-17"
    });
    expect(groups[0].entries).toHaveLength(2);
    expect(groups[0].contributors).toEqual([{ id: "developer-1", name: "Shakil" }]);
  });

  it("keeps untimed entries in the group without adding hours", () => {
    const [group] = groupProjectTasks([
      task("1", "Planning", null, "2026-09-18"),
      task("2", "Planning", 30, "2026-09-17")
    ]);

    expect(group).toMatchObject({ totalMinutes: 30, timedEntryCount: 1 });
    expect(group.entries).toHaveLength(2);
  });
});
