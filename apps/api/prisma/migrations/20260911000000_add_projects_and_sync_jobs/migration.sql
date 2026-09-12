CREATE TYPE "SyncJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "normalized_name" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_aliases" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "normalized_name" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_aliases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "discord_sync_jobs" (
    "id" UUID NOT NULL,
    "developer_id" UUID NOT NULL,
    "status" "SyncJobStatus" NOT NULL DEFAULT 'PENDING',
    "processed_messages" INTEGER NOT NULL DEFAULT 0,
    "imported_reports" INTEGER NOT NULL DEFAULT 0,
    "imported_tasks" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    CONSTRAINT "discord_sync_jobs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "status_tasks" ADD COLUMN "project_id" UUID;

CREATE UNIQUE INDEX "projects_normalized_name_key" ON "projects"("normalized_name");
CREATE UNIQUE INDEX "project_aliases_normalized_name_key" ON "project_aliases"("normalized_name");
CREATE INDEX "project_aliases_project_id_idx" ON "project_aliases"("project_id");
CREATE INDEX "status_tasks_project_id_idx" ON "status_tasks"("project_id");
CREATE INDEX "discord_sync_jobs_status_created_at_idx" ON "discord_sync_jobs"("status", "created_at");
CREATE INDEX "discord_sync_jobs_developer_id_created_at_idx" ON "discord_sync_jobs"("developer_id", "created_at");

ALTER TABLE "project_aliases" ADD CONSTRAINT "project_aliases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "status_tasks" ADD CONSTRAINT "status_tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "discord_sync_jobs" ADD CONSTRAINT "discord_sync_jobs_developer_id_fkey" FOREIGN KEY ("developer_id") REFERENCES "developers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
