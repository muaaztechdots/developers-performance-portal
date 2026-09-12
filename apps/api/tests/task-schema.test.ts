import { describe, expect, it } from "vitest";
import { taskProjectAssignmentSchema } from "../src/routes/tasks.js";

describe("taskProjectAssignmentSchema", () => {
  it("accepts a project id", () => {
    const projectId = "460ad6bb-a447-40a9-a488-3d4ffde898c8";
    expect(taskProjectAssignmentSchema.parse({ projectId })).toEqual({ projectId });
  });

  it("accepts null for an unassigned task", () => {
    expect(taskProjectAssignmentSchema.parse({ projectId: null })).toEqual({ projectId: null });
  });

  it("rejects an invalid project id", () => {
    expect(() => taskProjectAssignmentSchema.parse({ projectId: "not-a-uuid" })).toThrow();
  });
});
