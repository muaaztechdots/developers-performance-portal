# Developers Performance

An npm-workspaces monorepo for collecting developer daily status reports.

## Stack

- `apps/web`: React, Vite, TypeScript, React Router
- `apps/api`: Node.js, Express, TypeScript, Prisma
- PostgreSQL 17 through Docker Compose

## Run locally

1. Create the local environment files:

   ```powershell
   Copy-Item .env.example .env
   Copy-Item apps/api/.env.example apps/api/.env
   ```

2. Install dependencies and start PostgreSQL:

   ```powershell
   npm install
   npm run db:up
   ```

3. Create the schema and seed the first admin:

   ```powershell
   npm run db:migrate
   npm run db:seed
   ```

4. Start both applications:

   ```powershell
   npm run dev
   ```

Open <http://localhost:5173>. The default seed credentials are `muaaz@techdots.dev` / `Admin@123`; change them in `apps/api/.env` before seeding outside local development.

## Status data model

One `StatusReport` belongs to a developer and a calendar date. Its `StatusTask` rows represent yesterday/today items. A task always has a description, while `durationMinutes` and `taskUrl` are nullable. Project name, workflow status, notes, and ordering are also stored without flattening the original update into a single text field.

## Useful commands

```powershell
npm run build
npm run typecheck
npm test
npm run db:studio
npm run db:down
```

The API health endpoint is <http://localhost:4000/api/health>.

## Discord daily-status ingestion

The API reads only the configured `daily-status` channel. Each thread is treated as one developer. The latest 100 messages from active and archived public threads are imported at API startup and whenever an administrator clicks **Sync Discord**.

1. Create an application and bot in the [Discord Developer Portal](https://discord.com/developers/applications).
2. On the bot settings page, enable the **Message Content Intent**.
3. Invite the bot with only **View Channel** and **Read Message History** permissions for the status channel. Do not grant Send Messages, Manage Messages, Manage Threads, or administrator access.
4. Enable Developer Mode in Discord, then copy the server ID and the parent `daily-status` channel ID.
5. Add these values to `apps/api/.env` and restart the API:

   ```dotenv
   DISCORD_BOT_TOKEN=your-secret-bot-token
   DISCORD_GUILD_ID=your-server-id
   DISCORD_STATUS_CHANNEL_ID=your-daily-status-channel-id
   ```

The integration is strictly read-only on Discord: it does not subscribe to server-wide message events and only fetches the configured channel during a sync. It never sends, edits, deletes, reacts to, archives, or otherwise changes anything in Discord. It writes imported data only to this application's PostgreSQL database.

Never commit the bot token. Imported Discord-only developers receive disabled placeholder login accounts and default to engineering; they can be invited and assigned a different specialty later.

Admin endpoints:

- `GET /api/integrations/discord` — connection and last-sync status
- `POST /api/integrations/discord/sync` — manual backfill
- `POST /api/integrations/discord/sync-developers` — import every thread as an engineering developer
- `POST /api/integrations/discord/parse-preview` — preview how a message will be parsed
