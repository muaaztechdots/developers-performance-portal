CREATE TABLE "discord_status_submissions" (
  "id" UUID NOT NULL,
  "developer_id" UUID NOT NULL,
  "report_date" DATE NOT NULL,
  "thread_id" VARCHAR(32) NOT NULL,
  "message_id" VARCHAR(32),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "discord_status_submissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "discord_status_submission_tasks" (
  "id" UUID NOT NULL,
  "submission_id" UUID NOT NULL,
  "project_id" UUID,
  "project_name" VARCHAR(200) NOT NULL,
  "description" TEXT NOT NULL,
  "details" TEXT NOT NULL,
  "duration_minutes" INTEGER NOT NULL,
  "task_url" TEXT,
  "submitted_by_discord_user_id" VARCHAR(32) NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "discord_status_submission_tasks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "discord_status_submissions_message_id_key"
ON "discord_status_submissions"("message_id");

CREATE UNIQUE INDEX "discord_status_submissions_developer_id_report_date_key"
ON "discord_status_submissions"("developer_id", "report_date");

CREATE INDEX "discord_status_submissions_thread_id_report_date_idx"
ON "discord_status_submissions"("thread_id", "report_date");

CREATE INDEX "discord_status_submission_tasks_submission_id_sort_order_idx"
ON "discord_status_submission_tasks"("submission_id", "sort_order");

CREATE INDEX "discord_status_submission_tasks_project_id_idx"
ON "discord_status_submission_tasks"("project_id");

ALTER TABLE "discord_status_submissions"
ADD CONSTRAINT "discord_status_submissions_developer_id_fkey"
FOREIGN KEY ("developer_id") REFERENCES "developers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "discord_status_submission_tasks"
ADD CONSTRAINT "discord_status_submission_tasks_submission_id_fkey"
FOREIGN KEY ("submission_id") REFERENCES "discord_status_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "discord_status_submission_tasks"
ADD CONSTRAINT "discord_status_submission_tasks_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
