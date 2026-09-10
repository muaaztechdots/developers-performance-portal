import type { NextFunction, Request, Response } from "express";
import { AUTH_COOKIE, verifySessionToken } from "../lib/auth.js";

export function authenticate(request: Request, response: Response, next: NextFunction) {
  const cookieToken = request.cookies?.[AUTH_COOKIE] as string | undefined;
  const bearerToken = request.headers.authorization?.startsWith("Bearer ")
    ? request.headers.authorization.slice(7)
    : undefined;

  try {
    request.session = verifySessionToken(cookieToken ?? bearerToken ?? "");
    next();
  } catch {
    response.status(401).json({ message: "Authentication required." });
  }
}
