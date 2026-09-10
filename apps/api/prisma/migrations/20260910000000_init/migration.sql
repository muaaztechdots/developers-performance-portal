CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'DEVELOPER');
CREATE TYPE "ReportPeriod" AS ENUM ('YESTERDAY', 'TODAY');
CREATE TYPE "TaskStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED');

CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'DEVELOPER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "developers" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "job_title" VARCHAR(150),
    "department" VARCHAR(150),
    "timezone" VARCHAR(100) NOT NULL DEFAULT 'Asia/Karachi',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "developers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "status_reports" (
    "id" UUID NOT NULL,
    "developer_id" UUID NOT NULL,
    "report_date" DATE NOT NULL,
    "notes" TEXT,
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "status_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "status_tasks" (
    "id" UUID NOT NULL,
    "status_report_id" UUID NOT NULL,
    "period" "ReportPeriod" NOT NULL,
    "project_name" VARCHAR(200),
    "description" TEXT NOT NULL,
    "duration_minutes" INTEGER,
    "task_url" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'PLANNED',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "status_tasks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "developers_user_id_key" ON "developers"("user_id");
CREATE UNIQUE INDEX "status_reports_developer_id_report_date_key" ON "status_reports"("developer_id", "report_date");
CREATE INDEX "status_reports_report_date_idx" ON "status_reports"("report_date");
CREATE INDEX "status_tasks_status_report_id_period_sort_order_idx" ON "status_tasks"("status_report_id", "period", "sort_order");

ALTER TABLE "developers" ADD CONSTRAINT "developers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "status_reports" ADD CONSTRAINT "status_reports_developer_id_fkey" FOREIGN KEY ("developer_id") REFERENCES "developers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "status_tasks" ADD CONSTRAINT "status_tasks_status_report_id_fkey" FOREIGN KEY ("status_report_id") REFERENCES "status_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
