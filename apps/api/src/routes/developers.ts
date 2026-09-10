import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/authenticate.js";

export const developersRouter = Router();
developersRouter.use(authenticate);

const createDeveloperSchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8).max(128),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  jobTitle: z.string().trim().max(150).optional(),
  department: z.string().trim().max(150).optional(),
  timezone: z.string().trim().max(100).default("Asia/Karachi")
});

developersRouter.get("/", async (_request, response, next) => {
  try {
    const developers = await prisma.developer.findMany({
      orderBy: { user: { firstName: "asc" } },
      select: {
        id: true,
        jobTitle: true,
        department: true,
        timezone: true,
        specialty: true,
        discordThreadId: true,
        discordThreadName: true,
        user: { select: { email: true, firstName: true, lastName: true, isActive: true } },
        _count: { select: { statusReports: true } }
      }
    });
    response.json({ developers });
  } catch (error) {
    next(error);
  }
});

developersRouter.post("/", async (request, response, next) => {
  try {
    if (request.session!.role !== UserRole.ADMIN) {
      response.status(403).json({ message: "Administrator access required." });
      return;
    }
    const input = createDeveloperSchema.parse(request.body);
    const passwordHash = await bcrypt.hash(input.password, 12);
    const developer = await prisma.developer.create({
      data: {
        jobTitle: input.jobTitle,
        department: input.department,
        timezone: input.timezone,
        user: {
          create: {
            email: input.email,
            passwordHash,
            firstName: input.firstName,
            lastName: input.lastName,
            role: UserRole.DEVELOPER
          }
        }
      },
      include: { user: { select: { email: true, firstName: true, lastName: true } } }
    });
    response.status(201).json({ developer });
  } catch (error) {
    next(error);
  }
});
