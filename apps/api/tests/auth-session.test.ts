import jwt, { type JwtPayload } from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import {
  createSessionCookieOptions,
  createSessionToken,
  DEFAULT_SESSION_MAX_AGE_MS,
  REMEMBERED_SESSION_MAX_AGE_MS
} from "../src/lib/auth.js";

const payload = {
  sub: "user-id",
  email: "developer@example.com",
  role: "DEVELOPER" as const
};

function tokenLifetimeSeconds(token: string) {
  const decoded = jwt.decode(token) as JwtPayload;
  return decoded.exp! - decoded.iat!;
}

describe("authentication session duration", () => {
  it("uses the eight-hour duration by default", () => {
    expect(tokenLifetimeSeconds(createSessionToken(payload))).toBe(DEFAULT_SESSION_MAX_AGE_MS / 1000);
    expect(createSessionCookieOptions().maxAge).toBe(DEFAULT_SESSION_MAX_AGE_MS);
  });

  it("uses a matching 30-day token and cookie when keep signed in is selected", () => {
    expect(tokenLifetimeSeconds(createSessionToken(payload, true))).toBe(REMEMBERED_SESSION_MAX_AGE_MS / 1000);
    expect(createSessionCookieOptions(true).maxAge).toBe(REMEMBERED_SESSION_MAX_AGE_MS);
  });
});
