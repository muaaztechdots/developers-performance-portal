DROP INDEX IF EXISTS "status_reports_source_message_id_key";
CREATE INDEX "status_reports_source_message_id_idx" ON "status_reports"("source_message_id");
