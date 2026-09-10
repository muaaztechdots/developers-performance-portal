import { app } from "./app.js";
import { config } from "./config.js";
import { prisma } from "./lib/prisma.js";
import { startDiscordIntegration, stopDiscordIntegration } from "./integrations/discord/service.js";

const server = app.listen(config.API_PORT, () => {
  console.log(`API listening on http://localhost:${config.API_PORT}`);
  void startDiscordIntegration().catch((error) => console.error("Discord integration failed to start:", error));
});

async function shutdown() {
  stopDiscordIntegration();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
