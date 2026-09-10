import type { SessionPayload } from "../lib/auth.js";

declare global {
  namespace Express {
    interface Request {
      session?: SessionPayload;
    }
  }
}

export {};
