INSERT INTO "projects" ("id", "name", "normalized_name", "created_at", "updated_at")
VALUES
    (gen_random_uuid(), 'Cohabit', 'cohabit', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Lightening', 'lightening', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Klavi', 'klavi', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'CAA', 'caa', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Gritchi', 'gritchi', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Qscore', 'qscore', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Worklens', 'worklens', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Youforge', 'youforge', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Soulartists', 'soulartists', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'HomeliCare', 'homelicare', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("normalized_name") DO UPDATE
SET
    "name" = EXCLUDED."name",
    "updated_at" = CURRENT_TIMESTAMP;

DO $$
DECLARE
    qscore_project_id UUID;
    lightening_project_id UUID;
BEGIN
    SELECT "id" INTO qscore_project_id
    FROM "projects"
    WHERE "normalized_name" = 'qscore';

    UPDATE "status_tasks" AS task
    SET
        "project_id" = qscore_project_id,
        "project_name" = 'Qscore',
        "updated_at" = CURRENT_TIMESTAMP
    FROM "projects" AS duplicate
    WHERE task."project_id" = duplicate."id"
      AND duplicate."id" <> qscore_project_id
      AND duplicate."normalized_name" IN (
          'qscoremobapp', 'qscoremobileapp', 'qscoremobile',
          'qscorewebapp', 'qscoreweb', 'projectqscore'
      );

    UPDATE "project_aliases" AS alias
    SET "project_id" = qscore_project_id
    FROM "projects" AS duplicate
    WHERE alias."project_id" = duplicate."id"
      AND duplicate."id" <> qscore_project_id
      AND duplicate."normalized_name" IN (
          'qscoremobapp', 'qscoremobileapp', 'qscoremobile',
          'qscorewebapp', 'qscoreweb', 'projectqscore'
      );

    DELETE FROM "projects"
    WHERE "id" <> qscore_project_id
      AND "normalized_name" IN (
          'qscoremobapp', 'qscoremobileapp', 'qscoremobile',
          'qscorewebapp', 'qscoreweb', 'projectqscore'
      );

    SELECT "id" INTO lightening_project_id
    FROM "projects"
    WHERE "normalized_name" = 'lightening';

    UPDATE "status_tasks" AS task
    SET
        "project_id" = lightening_project_id,
        "project_name" = 'Lightening',
        "updated_at" = CURRENT_TIMESTAMP
    FROM "projects" AS duplicate
    WHERE task."project_id" = duplicate."id"
      AND duplicate."id" <> lightening_project_id
      AND duplicate."normalized_name" IN (
          'lightning', 'projectlightning', 'projectlightening',
          'lightningwebapp', 'lightningmobileapp'
      );

    UPDATE "project_aliases" AS alias
    SET "project_id" = lightening_project_id
    FROM "projects" AS duplicate
    WHERE alias."project_id" = duplicate."id"
      AND duplicate."id" <> lightening_project_id
      AND duplicate."normalized_name" IN (
          'lightning', 'projectlightning', 'projectlightening',
          'lightningwebapp', 'lightningmobileapp'
      );

    DELETE FROM "projects"
    WHERE "id" <> lightening_project_id
      AND "normalized_name" IN (
          'lightning', 'projectlightning', 'projectlightening',
          'lightningwebapp', 'lightningmobileapp'
      );
END $$;

UPDATE "status_tasks"
SET
    "project_id" = NULL,
    "project_name" = NULL,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "project_id" IN (
    SELECT "id"
    FROM "projects"
    WHERE "normalized_name" NOT IN (
        'cohabit', 'lightening', 'klavi', 'caa', 'gritchi',
        'qscore', 'worklens', 'youforge', 'soulartists', 'homelicare'
    )
);

DELETE FROM "projects"
WHERE "normalized_name" NOT IN (
    'cohabit', 'lightening', 'klavi', 'caa', 'gritchi',
    'qscore', 'worklens', 'youforge', 'soulartists', 'homelicare'
);

UPDATE "status_tasks" AS task
SET
    "project_name" = project."name",
    "updated_at" = CURRENT_TIMESTAMP
FROM "projects" AS project
WHERE task."project_id" = project."id"
  AND task."project_name" IS DISTINCT FROM project."name";

UPDATE "status_tasks"
SET
    "project_name" = NULL,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "project_id" IS NULL
  AND "project_name" IS NOT NULL;
