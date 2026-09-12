CREATE TYPE "TaskStatus_new" AS ENUM ('IN_PROGRESS', 'DONE');

ALTER TABLE "status_tasks" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "status_tasks"
  ALTER COLUMN "status" TYPE "TaskStatus_new"
  USING (
    CASE
      WHEN "status"::text IN ('IN_PROGRESS', 'BLOCKED') THEN 'IN_PROGRESS'::"TaskStatus_new"
      ELSE 'DONE'::"TaskStatus_new"
    END
  );

DROP TYPE "TaskStatus";
ALTER TYPE "TaskStatus_new" RENAME TO "TaskStatus";
ALTER TABLE "status_tasks" ALTER COLUMN "status" SET DEFAULT 'DONE';
