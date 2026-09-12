import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { config } from "./config.js";
import { authRouter } from "./routes/auth.js";
import { developersRouter } from "./routes/developers.js";
import { statusReportsRouter } from "./routes/status-reports.js";
import { integrationsRouter } from "./routes/integrations.js";
import { tasksRouter } from "./routes/tasks.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { projectsRouter } from "./routes/projects.js";
import { errorHandler } from "./middleware/error-handler.js";

export const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: config.WEB_ORIGIN, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.get("/api/health", (_request, response) => response.json({ status: "ok" }));
app.use("/api/auth", authRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/developers", developersRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/status-reports", statusReportsRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/integrations", integrationsRouter);
app.use((_request, response) => response.status(404).json({ message: "Route not found." }));
app.use(errorHandler);
