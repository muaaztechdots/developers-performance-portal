CREATE TABLE "clickup_tickets" (
    "id" VARCHAR(100) NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "url" TEXT NOT NULL,
    "last_sync_attempt_at" TIMESTAMP(3),
    "last_synced_at" TIMESTAMP(3),
    "sync_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clickup_tickets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "clickup_comments" (
    "id" UUID NOT NULL,
    "clickup_ticket_id" VARCHAR(100) NOT NULL,
    "external_id" VARCHAR(100) NOT NULL,
    "text" TEXT NOT NULL,
    "author" VARCHAR(320) NOT NULL,
    "author_avatar" TEXT,
    "clickup_created_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clickup_comments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "status_tasks" ADD COLUMN "clickup_task_id" VARCHAR(100);

CREATE INDEX "clickup_tickets_last_sync_attempt_at_idx" ON "clickup_tickets"("last_sync_attempt_at");
CREATE INDEX "clickup_comments_clickup_ticket_id_clickup_created_at_idx" ON "clickup_comments"("clickup_ticket_id", "clickup_created_at");
CREATE UNIQUE INDEX "clickup_comments_clickup_ticket_id_external_id_key" ON "clickup_comments"("clickup_ticket_id", "external_id");
CREATE INDEX "status_tasks_clickup_task_id_idx" ON "status_tasks"("clickup_task_id");

ALTER TABLE "clickup_comments" ADD CONSTRAINT "clickup_comments_clickup_ticket_id_fkey" FOREIGN KEY ("clickup_ticket_id") REFERENCES "clickup_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "status_tasks" ADD CONSTRAINT "status_tasks_clickup_task_id_fkey" FOREIGN KEY ("clickup_task_id") REFERENCES "clickup_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
