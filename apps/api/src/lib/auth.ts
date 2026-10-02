import jwt from "jsonwebtoken";
import { config } from "../config.js";

export const AUTH_COOKIE = "developer_performance_session";

export type SessionPayload = {
  sub: string;
  email: string;
  role: "ADMIN" | "DEVELOPER";
};

export const DEFAULT_SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;
export const REMEMBERED_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function createSessionToken(payload: SessionPayload, keepSignedIn = false) {
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn: keepSignedIn ? "30d" : "8h" });
}

export function verifySessionToken(token: string) {
  return jwt.verify(token, config.JWT_SECRET) as SessionPayload;
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: config.NODE_ENV === "production",
  maxAge: DEFAULT_SESSION_MAX_AGE_MS,
  path: "/"
};

export function createSessionCookieOptions(keepSignedIn = false) {
  return {
    ...sessionCookieOptions,
    maxAge: keepSignedIn ? REMEMBERED_SESSION_MAX_AGE_MS : DEFAULT_SESSION_MAX_AGE_MS
  };
}
