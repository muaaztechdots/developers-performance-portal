CREATE TYPE "DeveloperSpecialty" AS ENUM ('ENGINEERING', 'QA');
CREATE TYPE "ReportSource" AS ENUM ('MANUAL', 'DISCORD');

ALTER TABLE "developers"
ADD COLUMN "specialty" "DeveloperSpecialty" NOT NULL DEFAULT 'ENGINEERING',
ADD COLUMN "discord_thread_id" VARCHAR(32),
ADD COLUMN "discord_thread_name" VARCHAR(200);

ALTER TABLE "status_reports"
ADD COLUMN "source" "ReportSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN "source_message_id" VARCHAR(32),
ADD COLUMN "source_thread_id" VARCHAR(32),
ADD COLUMN "raw_content" TEXT,
ADD COLUMN "imported_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "developers_discord_thread_id_key" ON "developers"("discord_thread_id");
CREATE UNIQUE INDEX "status_reports_source_message_id_key" ON "status_reports"("source_message_id");
CREATE INDEX "status_reports_source_thread_id_idx" ON "status_reports"("source_thread_id");
