import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { AUTH_COOKIE, createSessionToken, sessionCookieOptions } from "../lib/auth.js";
import { authenticate } from "../middleware/authenticate.js";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8).max(128)
});

const publicUser = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  developer: { select: { id: true, jobTitle: true, department: true } }
} as const;

authRouter.post("/login", async (request, response, next) => {
  try {
    const input = loginSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: input.email } });

    if (!user?.isActive || !(await bcrypt.compare(input.password, user.passwordHash))) {
      response.status(401).json({ message: "Invalid email or password." });
      return;
    }

    const token = createSessionToken({ sub: user.id, email: user.email, role: user.role });
    response.cookie(AUTH_COOKIE, token, sessionCookieOptions);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const signedInUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: publicUser });
    response.json({ user: signedInUser });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", authenticate, async (request, response, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: request.session!.sub }, select: publicUser });
    if (!user) {
      response.status(401).json({ message: "Session user no longer exists." });
      return;
    }
    response.json({ user });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/logout", (_request, response) => {
  response.clearCookie(AUTH_COOKIE, { ...sessionCookieOptions, maxAge: undefined });
  response.status(204).send();
});
