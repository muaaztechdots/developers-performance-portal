ALTER TYPE "SyncJobPhase" ADD VALUE 'GITHUB';

ALTER TABLE "status_tasks"
ADD COLUMN "github_pull_request_id" UUID;

ALTER TABLE "discord_sync_jobs"
ADD COLUMN "force_refresh" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "github_linked_tasks" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "github_processed_pull_requests" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "github_synced_pull_requests" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "github_failed_pull_requests" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "github_pull_requests" (
  "id" UUID NOT NULL,
  "owner" VARCHAR(100) NOT NULL,
  "repository" VARCHAR(100) NOT NULL,
  "number" INTEGER NOT NULL,
  "url" TEXT NOT NULL,
  "title" TEXT,
  "state" VARCHAR(30),
  "draft" BOOLEAN NOT NULL DEFAULT false,
  "merged" BOOLEAN NOT NULL DEFAULT false,
  "author" VARCHAR(320),
  "author_avatar" TEXT,
  "source_branch" TEXT,
  "target_branch" TEXT,
  "additions" INTEGER NOT NULL DEFAULT 0,
  "deletions" INTEGER NOT NULL DEFAULT 0,
  "changed_files" INTEGER NOT NULL DEFAULT 0,
  "files_truncated" BOOLEAN NOT NULL DEFAULT false,
  "last_sync_attempt_at" TIMESTAMP(3),
  "last_synced_at" TIMESTAMP(3),
  "sync_error" TEXT,
  "sync_error_kind" VARCHAR(30),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "github_pull_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "github_pull_request_files" (
  "id" UUID NOT NULL,
  "github_pull_request_id" UUID NOT NULL,
  "filename" TEXT NOT NULL,
  "status" VARCHAR(30) NOT NULL,
  "additions" INTEGER NOT NULL DEFAULT 0,
  "deletions" INTEGER NOT NULL DEFAULT 0,
  "changes" INTEGER NOT NULL DEFAULT 0,
  "patch" TEXT,
  "previous_filename" TEXT,
  "blob_url" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "github_pull_request_files_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "github_pull_requests_owner_repository_number_key" ON "github_pull_requests"("owner", "repository", "number");
CREATE INDEX "github_pull_requests_last_sync_attempt_at_idx" ON "github_pull_requests"("last_sync_attempt_at");
CREATE UNIQUE INDEX "github_pull_request_files_github_pull_request_id_filename_key" ON "github_pull_request_files"("github_pull_request_id", "filename");
CREATE INDEX "github_pull_request_files_github_pull_request_id_sort_order_idx" ON "github_pull_request_files"("github_pull_request_id", "sort_order");
CREATE INDEX "status_tasks_github_pull_request_id_idx" ON "status_tasks"("github_pull_request_id");

ALTER TABLE "status_tasks"
ADD CONSTRAINT "status_tasks_github_pull_request_id_fkey"
FOREIGN KEY ("github_pull_request_id") REFERENCES "github_pull_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "github_pull_request_files"
ADD CONSTRAINT "github_pull_request_files_github_pull_request_id_fkey"
FOREIGN KEY ("github_pull_request_id") REFERENCES "github_pull_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
