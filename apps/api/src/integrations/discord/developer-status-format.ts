import type { DiscordStatusParserOptions } from "./status-parser.js";

type DeveloperStatusIdentity = {
  firstName: string;
};

export function parserOptionsForDeveloper(developer: DeveloperStatusIdentity): DiscordStatusParserOptions {
  if (developer.firstName.trim().toLocaleLowerCase() === "burhan") {
    return { defaultProjectName: "Lightening" };
  }

  return {};
}
