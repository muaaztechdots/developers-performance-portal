CREATE TYPE "SyncJobPhase" AS ENUM ('DISCORD', 'CLICKUP');

ALTER TABLE "discord_sync_jobs"
ADD COLUMN "phase" "SyncJobPhase" NOT NULL DEFAULT 'DISCORD',
ADD COLUMN "clickup_linked_tasks" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "clickup_processed_tickets" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "clickup_synced_tickets" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "clickup_failed_tickets" INTEGER NOT NULL DEFAULT 0;
