import { describe, expect, it } from "vitest";
import { updateDeveloperSchema } from "../src/routes/developers.js";

describe("updateDeveloperSchema", () => {
  it("normalizes account details and optional profile fields", () => {
    expect(updateDeveloperSchema.parse({
      email: "  Dev@Example.com ",
      firstName: " Dev ",
      lastName: " User ",
      jobTitle: " ",
      department: " Engineering ",
      timezone: "Asia/Karachi",
      specialty: "ENGINEERING",
      isActive: true
    })).toEqual({
      email: "dev@example.com",
      firstName: "Dev",
      lastName: "User",
      jobTitle: null,
      department: "Engineering",
      timezone: "Asia/Karachi",
      specialty: "ENGINEERING",
      isActive: true
    });
  });

  it("rejects an invalid timezone", () => {
    expect(() => updateDeveloperSchema.parse({
      email: "dev@example.com",
      firstName: "Dev",
      lastName: "User",
      jobTitle: "Developer",
      department: "Engineering",
      timezone: "Somewhere/Invalid",
      specialty: "QA",
      isActive: true
    })).toThrow();
  });

  it("allows an empty last name", () => {
    const result = updateDeveloperSchema.parse({
      email: "dev@example.com",
      firstName: "Dev",
      lastName: "",
      jobTitle: "Developer",
      department: "Engineering",
      timezone: "Asia/Karachi",
      specialty: "ENGINEERING",
      isActive: true
    });

    expect(result.lastName).toBe("");
  });
});
