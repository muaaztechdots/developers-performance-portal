DO $$
DECLARE
    canonical_project_id UUID;
BEGIN
    SELECT "id"
    INTO canonical_project_id
    FROM "projects"
    WHERE "normalized_name" IN (
        'homelicare', 'homlicare', 'homilycare',
        'homelicareweb', 'homlicareweb', 'homilycareweb',
        'homelicarewebapp', 'homlicarewebapp', 'homilycarewebapp',
        'homelicaremobile', 'homlicaremobile', 'homilycaremobile',
        'homelicaremobapp', 'homlicaremobapp', 'homilycaremobapp',
        'homelicaremobileapp', 'homlicaremobileapp', 'homilycaremobileapp'
    )
    ORDER BY
        CASE WHEN "normalized_name" = 'homelicare' THEN 0 ELSE 1 END,
        "created_at"
    LIMIT 1;

    IF canonical_project_id IS NOT NULL THEN
        UPDATE "status_tasks"
        SET
            "project_id" = canonical_project_id,
            "project_name" = 'HomeliCare',
            "updated_at" = CURRENT_TIMESTAMP
        WHERE "project_id" IN (
            SELECT "id"
            FROM "projects"
            WHERE "normalized_name" IN (
                'homelicare', 'homlicare', 'homilycare',
                'homelicareweb', 'homlicareweb', 'homilycareweb',
                'homelicarewebapp', 'homlicarewebapp', 'homilycarewebapp',
                'homelicaremobile', 'homlicaremobile', 'homilycaremobile',
                'homelicaremobapp', 'homlicaremobapp', 'homilycaremobapp',
                'homelicaremobileapp', 'homlicaremobileapp', 'homilycaremobileapp'
            )
        )
        OR LOWER(REGEXP_REPLACE(COALESCE("project_name", ''), '[^a-zA-Z0-9]', '', 'g')) IN (
            'homelicare', 'homlicare', 'homilycare',
            'homelicareweb', 'homlicareweb', 'homilycareweb',
            'homelicarewebapp', 'homlicarewebapp', 'homilycarewebapp',
            'homelicaremobile', 'homlicaremobile', 'homilycaremobile',
            'homelicaremobapp', 'homlicaremobapp', 'homilycaremobapp',
            'homelicaremobileapp', 'homlicaremobileapp', 'homilycaremobileapp'
        );

        UPDATE "project_aliases"
        SET "project_id" = canonical_project_id
        WHERE "project_id" IN (
            SELECT "id"
            FROM "projects"
            WHERE "id" <> canonical_project_id
              AND "normalized_name" IN (
                  'homelicare', 'homlicare', 'homilycare',
                  'homelicareweb', 'homlicareweb', 'homilycareweb',
                  'homelicarewebapp', 'homlicarewebapp', 'homilycarewebapp',
                  'homelicaremobile', 'homlicaremobile', 'homilycaremobile',
                  'homelicaremobapp', 'homlicaremobapp', 'homilycaremobapp',
                  'homelicaremobileapp', 'homlicaremobileapp', 'homilycaremobileapp'
              )
        )
        OR "normalized_name" IN (
            'homelicare', 'homlicare', 'homilycare',
            'homelicareweb', 'homlicareweb', 'homilycareweb',
            'homelicarewebapp', 'homlicarewebapp', 'homilycarewebapp',
            'homelicaremobile', 'homlicaremobile', 'homilycaremobile',
            'homelicaremobapp', 'homlicaremobapp', 'homilycaremobapp',
            'homelicaremobileapp', 'homlicaremobileapp', 'homilycaremobileapp'
        );

        DELETE FROM "projects"
        WHERE "id" <> canonical_project_id
          AND "normalized_name" IN (
              'homelicare', 'homlicare', 'homilycare',
              'homelicareweb', 'homlicareweb', 'homilycareweb',
              'homelicarewebapp', 'homlicarewebapp', 'homilycarewebapp',
              'homelicaremobile', 'homlicaremobile', 'homilycaremobile',
              'homelicaremobapp', 'homlicaremobapp', 'homilycaremobapp',
              'homelicaremobileapp', 'homlicaremobileapp', 'homilycaremobileapp'
          );

        UPDATE "projects"
        SET
            "name" = 'HomeliCare',
            "normalized_name" = 'homelicare',
            "updated_at" = CURRENT_TIMESTAMP
        WHERE "id" = canonical_project_id;
    END IF;
END $$;
