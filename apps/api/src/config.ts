import "dotenv/config";
import { z } from "zod";

const optionalString = (schema: z.ZodString) =>
  z.preprocess((value) => typeof value === "string" && value.trim() === "" ? undefined : value, schema.optional());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1).default("postgresql://postgres:postgres@localhost:5432/developers_performance?schema=public"),
  JWT_SECRET: z.string().min(16).default("local-development-secret-change-me"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  DISCORD_BOT_TOKEN: optionalString(z.string().trim()),
  DISCORD_GUILD_ID: optionalString(z.string().regex(/^\d+$/)),
  DISCORD_STATUS_CHANNEL_ID: optionalString(z.string().regex(/^\d+$/)),
  CLICKUP_API_TOKEN: optionalString(z.string().trim())
});

export const config = envSchema.parse(process.env);
