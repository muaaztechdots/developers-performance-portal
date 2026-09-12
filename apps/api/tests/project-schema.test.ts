import { describe, expect, it } from "vitest";
import { projectInputSchema } from "../src/routes/projects.js";

describe("projectInputSchema", () => {
  it("trims a project and its aliases", () => {
    expect(projectInputSchema.parse({
      name: "  HomeliCare  ",
      aliases: [" Homeli Care ", "HC"]
    })).toEqual({ name: "HomeliCare", aliases: ["Homeli Care", "HC"] });
  });

  it("defaults aliases to an empty list", () => {
    expect(projectInputSchema.parse({ name: "Cohabit" }).aliases).toEqual([]);
  });

  it("rejects an empty project name", () => {
    expect(() => projectInputSchema.parse({ name: "   " })).toThrow();
  });
});
