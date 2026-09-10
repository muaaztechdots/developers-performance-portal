import jwt from "jsonwebtoken";
import { config } from "../config.js";

export const AUTH_COOKIE = "developer_performance_session";

export type SessionPayload = {
  sub: string;
  email: string;
  role: "ADMIN" | "DEVELOPER";
};

export function createSessionToken(payload: SessionPayload) {
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn: "8h" });
}

export function verifySessionToken(token: string) {
  return jwt.verify(token, config.JWT_SECRET) as SessionPayload;
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: config.NODE_ENV === "production",
  maxAge: 8 * 60 * 60 * 1000,
  path: "/"
};
