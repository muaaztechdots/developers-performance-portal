# Developers Performance - Local Project Context

> Read this file before making changes. It is the local architectural and product context for this repository. Use it to avoid rediscovering the whole codebase or asking the user to restate established behavior. Update it whenever architecture, data flow, integrations, or important product rules change.

## 1. Project purpose

Developers Performance is an internal engineering-status dashboard. It imports daily developer updates from Discord, enriches linked work with ClickUp ticket data, imports GitHub pull-request changes, and persists everything in PostgreSQL for reporting and review.

The main product areas are:

- Team dashboard and previous-working-day status coverage.
- Developer directory and developer profile management.
- Per-developer status/task history.
- Project catalog, aliases, project detail, grouped tasks, and total hours.
- Daily, monthly, and custom-range performance reporting.
- Task detail with a default Details tab and a GitHub Changes tab.
- A background sync queue with Discord, ClickUp, and GitHub phases.

The application is read-only toward ClickUp and GitHub. On Discord it reads configured status threads and may create or edit only its own unified status messages in response to `/status`; imported data is written to PostgreSQL.

## 2. Established product rules

These rules are intentional. Do not change them accidentally.

1. The backend sync sequence is always:

   ```text
   Discord -> ClickUp -> GitHub -> completed
   ```

2. A job remains running until all three phases have been attempted.
3. Sync-all jobs process developers one at a time through the worker queue.
4. Sync-all and scheduled integration refreshes use a 24-hour freshness check.
5. Clicking Sync Tasks for one developer is a forced sync. It refreshes that developer's ClickUp and GitHub data even if it was attempted less than 24 hours ago.
6. If a single-developer sync finds an existing pending/running job, it upgrades that job to `forceRefresh=true`.
7. External API data is persisted. Task pages read PostgreSQL; they do not wait on ClickUp or GitHub.
8. Discord imports only tasks under `Today:`. Yesterday content is not stored as imported tasks.
9. A Discord project heading is followed by a task heading. Bullet points after the task heading are details of that task, not separate tasks.
10. Durations in task-detail bullets are added together for the parent task.
11. Discord imports never create projects. They only attach tasks to existing catalog projects or aliases.
12. Project task grouping uses the normalized task description and sums duration across matching entries.
13. The task detail page always opens on the Details tab. GitHub Changes is the second tab.
14. GitHub tokens and all other secrets stay server-side and must never be committed or exposed to the browser.
15. Do not delete developer/status/task data or reset the database unless the user explicitly requests it.
16. `/status` drafts may contain multiple tasks, but Submit publishes one bot-owned message per developer/date and queues the normal import pipeline.
17. Bot-submitted projects must come from the existing project catalog, and an optional PR link must be a canonical GitHub pull-request URL.

## 3. Technology stack

| Area | Technology |
| --- | --- |
| Monorepo | npm workspaces |
| Runtime | Node.js 22+ |
| Frontend | React 19, Vite, TypeScript, React Router 7 |
| UI icons | Lucide React |
| API | Express 5, TypeScript, Zod |
| Authentication | JWT in an HTTP-only cookie; bearer token also accepted by middleware |
| ORM | Prisma 6 |
| Database | PostgreSQL 17 |
| Integrations | Discord REST API, ClickUp REST API, GitHub REST API |
| Tests | Vitest |
| Local database | Docker Compose |

## 4. Runtime architecture

```text
React/Vite browser
        |
        | credentials: include
        v
Express API :4000 ----------------------> PostgreSQL :5432
        ^                                      ^
        |                                      |
        | job polling                          | imported/cache data
        |                                      |
Background worker -----------------------------+
        |
        +--> Discord (read threads; create/edit bot-owned status messages)
        +--> ClickUp (ticket/comments, read-only)
        +--> GitHub (PR metadata/files/patches, read-only)
```

`npm run dev` starts three processes:

- API: `tsx watch src/server.ts`
- Worker: `tsx watch src/worker.ts`
- Web: Vite dev server

The API handles HTTP requests and Discord connection status. The worker owns long-running imports and integration refreshes.

## 5. Repository structure

```text
.
|-- AGENTS.md                      # This file: local architectural context
|-- README.md                      # User-facing setup and feature overview
|-- .env.example                   # Environment-variable template; never add secrets
|-- package.json                   # Workspace scripts
|-- docker-compose.yml             # PostgreSQL 17 service and persistent volume
|-- apps/
|   |-- api/
|   |   |-- package.json
|   |   |-- prisma/
|   |   |   |-- schema.prisma      # Canonical database model
|   |   |   |-- seed.ts            # Creates/updates the first admin
|   |   |   `-- migrations/        # Append-only schema history
|   |   |-- src/
|   |   |   |-- app.ts             # Express middleware and route mounting
|   |   |   |-- server.ts          # HTTP server and Discord connection lifecycle
|   |   |   |-- worker.ts          # Sequential sync queue and 24-hour refresh timer
|   |   |   |-- config.ts          # Zod-validated environment configuration
|   |   |   |-- integrations/
|   |   |   |   |-- discord/
|   |   |   |   |   |-- service.ts          # Discord connection/thread discovery
|   |   |   |   |   |-- status-parser.ts    # Status text -> dated task records
|   |   |   |   |   |-- task-importer.ts    # Thread history -> reports/tasks
|   |   |   |   |   `-- project-matcher.ts  # Catalog normalization/fuzzy matching
|   |   |   |   |-- clickup/
|   |   |   |   |   |-- service.ts          # ClickUp HTTP client and normalization
|   |   |   |   |   `-- sync.ts             # Task linking and 24-hour/forced refresh
|   |   |   |   `-- github/
|   |   |   |       |-- service.ts          # GitHub PR/files client and API errors
|   |   |   |       `-- sync.ts             # PR discovery, persistence, freshness policy
|   |   |   |-- routes/
|   |   |   |   |-- auth.ts
|   |   |   |   |-- dashboard.ts
|   |   |   |   |-- developers.ts
|   |   |   |   |-- integrations.ts
|   |   |   |   |-- projects.ts
|   |   |   |   |-- reports.ts
|   |   |   |   |-- status-reports.ts
|   |   |   |   `-- tasks.ts
|   |   |   |-- lib/
|   |   |   |   |-- auth.ts                  # JWT and cookie options
|   |   |   |   |-- dashboard-summary.ts
|   |   |   |   |-- github-pull-request.ts   # PR URL extraction/normalization
|   |   |   |   |-- prisma.ts                # Shared Prisma client
|   |   |   |   `-- report-summary.ts
|   |   |   |-- middleware/
|   |   |   |   |-- authenticate.ts
|   |   |   |   `-- error-handler.ts
|   |   |   `-- types/express.d.ts
|   |   `-- tests/                   # API/parser/integration unit tests
|   `-- web/
|       |-- package.json
|       |-- vite.config.ts
|       |-- index.html
|       `-- src/
|           |-- App.tsx              # Frontend routes
|           |-- main.tsx
|           |-- styles.css           # Shared application stylesheet
|           |-- types.ts             # Browser-side API contracts
|           |-- context/AuthContext.tsx
|           |-- components/
|           |   |-- AppShell.tsx
|           |   `-- Brand.tsx
|           |-- lib/
|           |   |-- api.ts                    # Credentialed API client
|           |   |-- developer-calendar.ts
|           |   |-- github-diff.ts            # Patch -> line-numbered diff rows
|           |   |-- project-task-groups.ts    # Group and total project tasks
|           |   `-- status-sync-session.ts    # Browser-session sync tracking
|           `-- pages/
|               |-- LoginPage.tsx
|               |-- DashboardPage.tsx
|               |-- DevelopersPage.tsx
|               |-- DeveloperEditPage.tsx
|               |-- DeveloperTasksPage.tsx
|               |-- TaskDetailPage.tsx
|               |-- ProjectsPage.tsx
|               |-- ProjectFormPage.tsx
|               |-- ProjectDetailPage.tsx
|               `-- ReportsPage.tsx
```

## 6. Database model

The canonical source is `apps/api/prisma/schema.prisma`.

### Core relationships

```text
User 1 --- 0..1 Developer
Developer 1 --- * StatusReport
Developer 1 --- * DiscordSyncJob
Developer 1 --- * DiscordStatusSubmission
DiscordStatusSubmission 1 --- * DiscordStatusSubmissionTask
StatusReport 1 --- * StatusTask
Project 1 --- * ProjectAlias
Project 1 --- * StatusTask
ClickUpTicket 1 --- * ClickUpComment
ClickUpTicket 1 --- * StatusTask
GitHubPullRequest 1 --- * GitHubPullRequestFile
GitHubPullRequest 1 --- * StatusTask
```

### Model responsibilities

| Model | Responsibility |
| --- | --- |
| `User` | Login identity, role, active state, password hash |
| `Developer` | Developer profile, specialty, timezone, linked Discord thread |
| `Project` | Canonical project catalog entry |
| `ProjectAlias` | Explicit alternative names used during Discord matching |
| `StatusReport` | One developer's report for one calendar date |
| `StatusTask` | A parsed Today task, its detail bullets, time, link, project, ClickUp and GitHub links |
| `ClickUpTicket` | Persisted ticket title/description/sync state |
| `ClickUpComment` | Persisted ClickUp comment history |
| `GitHubPullRequest` | Persisted PR summary, branches, totals, and sync state |
| `GitHubPullRequestFile` | Persisted changed-file metadata and text patch |
| `DiscordSyncJob` | Full Discord/ClickUp/GitHub job state, phase, force policy, progress, counters |
| `DiscordStatusSubmission` | One bot composer and published Discord message per developer/date |
| `DiscordStatusSubmissionTask` | Project-selected task draft with time, optional PR URL, and submitter audit ID |

### Important constraints

- `User.email` is unique.
- `Developer.userId` and `Developer.discordThreadId` are unique.
- `StatusReport` is unique by `(developerId, reportDate)`.
- `Project.normalizedName` and every alias normalized name are unique.
- `ClickUpTicket.id` is the external ClickUp task ID.
- GitHub PRs are unique by `(owner, repository, number)`.
- GitHub files are unique by `(githubPullRequestId, filename)`.
- Deleting a report cascades to tasks.
- Project, ClickUp, and GitHub foreign keys on tasks use `SET NULL` when their parent is removed.

### Current schema endpoint

The latest migration is:

```text
20261001010000_add_discord_submission_pr_link
```

It adds a separate GitHub PR URL to bot-submitted task drafts so ClickUp and GitHub links can both be retained.

## 7. Discord status parsing and import

### Expected format

The preferred input shape is:

```text
17/09/2026

Today:

EasyRinger
Mobile App Implementation [WIP]
- Built the messages screens (2hr)
- Wired the unread count (30m)

EasyRinger
Chrome Extension [WIP]
- Asked the client to merge develop to master (1h)
```

The intended stored tasks are:

- Project `EasyRinger`, task `Mobile App Implementation`, two newline-separated details, total 150 minutes.
- Project `EasyRinger`, task `Chrome Extension`, one detail, total 60 minutes.

### Parser behavior

- Accepts dates in `DD/MM/YYYY`, `DD-MM-YYYY`, or `DD.MM.YYYY` form, including two-digit years.
- Supports multiple dated sections in one Discord message.
- Decodes common HTML space entities such as `&#x20;` and `&nbsp;`.
- Removes Markdown bold markers, status markers, URLs, and duration tokens from display text.
- Recognizes hour/minute variants such as `2hr`, `1h 30m`, `40 min`, and decimals.
- Keeps repeated spaces before a duration within the same task line instead of splitting the task heading.
- Recognizes Markdown and plain HTTPS task links.
- Preserves explicit `PR:` detail URLs so the GitHub phase can discover them while retaining a separate ClickUp task URL.
- Treats a short non-bullet line as a project heading when the following structure indicates a task.
- Treats a non-bullet task heading after a project as the `StatusTask.description`.
- Treats following bullet points as `StatusTask.details`, separated by newline.
- Adds durations from detail bullets to the parent task's `durationMinutes`.
- Uses the first available task/detail URL as `taskUrl`.
- Only the `Today:` section is imported.

### Import behavior

`task-importer.ts`:

1. Fetches the full linked Discord thread history.
2. Sorts messages oldest to newest.
3. Parses all dated status sections.
4. Upserts one `StatusReport` for each developer/date.
5. Deletes the existing `TODAY` tasks for that report.
6. Recreates the parsed Today tasks.
7. Resolves projects against the existing project catalog.
8. Updates job progress every five messages and at completion.

Because Today-task rows are recreated on every Discord import, their task IDs can change. ClickUp and GitHub phases must run after Discord so the new rows are relinked.

### Bot submission flow

1. The developer runs `/status` inside their linked Discord thread.
2. The private composer defaults to the developer's local date and loads projects from the catalog.
3. Change date switches the active report date; selecting a project opens a five-field modal for task title, multiline details, time spent, optional ClickUp ticket URL, and optional GitHub PR URL.
4. Repeating the selection adds tasks; Remove last task corrects the draft.
5. Submit status creates or edits one bot-owned canonical message and queues a non-forced developer sync.
6. The importer trusts only bot message IDs persisted by `DiscordStatusSubmission`; unrelated bot messages stay ignored. Trusted bot messages are processed after legacy human messages, so the unified submission is authoritative for that developer/date.

## 8. Project matching and project details

`project-matcher.ts` normalizes names by:

- Removing case, spacing, punctuation, accents, and camel-case differences.
- Treating `&` as `and`.
- Ignoring a leading `Project`.
- Ignoring trailing platform qualifiers such as `Web`, `Website`, `App`, `Mobile App`, `iOS`, and `Android`.
- Allowing conservative Levenshtein-distance spelling variation.

Discord imports only select an existing `Project` or `ProjectAlias`. They never create one.

The project detail page:

- Loads all visible tasks for the project.
- Groups tasks by trimmed, whitespace-normalized, case-insensitive description.
- Sums `durationMinutes` per task group.
- Shows entry count, timed-entry count, latest date, and contributors.
- Links each underlying entry back to its developer task detail page.

## 9. Background sync queue

`apps/api/src/worker.ts` owns the queue.

### Job states

```text
PENDING -> RUNNING -> COMPLETED
                   `-> FAILED (unexpected fatal error)
```

### Job phases

```text
DISCORD -> CLICKUP -> GITHUB
```

### Job processing

1. Claim the oldest pending job using an atomic status update.
2. Reset phase counters and set `RUNNING/DISCORD`.
3. Import the developer's Discord thread.
4. Set phase to `CLICKUP` and run the developer-scoped ClickUp queue.
5. Save ClickUp counters and set phase to `GITHUB`.
6. Run the developer-scoped GitHub queue.
7. Save GitHub counters and mark the job `COMPLETED`.
8. Continue to the next developer only after the current developer reaches completion/failure.

The ClickUp and GitHub queues are individually serialized with promise chains, so scheduled refreshes and job refreshes do not run the same integration cycle concurrently.

On worker startup, abandoned `RUNNING` jobs are reset to `PENDING/DISCORD` and resumed.

### Global versus forced policy

| Trigger | `forceRefresh` | Discord | ClickUp | GitHub |
| --- | ---: | --- | --- | --- |
| Sync all developers | `false` | Import | Refresh if last attempt is older than 24h | Refresh if last attempt is older than 24h |
| Scheduled worker cycle | n/a | Not run | Refresh stale tickets | Refresh stale PRs |
| Single developer Sync Tasks | `true` | Import | Always refresh developer tickets | Always refresh developer PRs |

If GitHub previously returned `AUTH_REQUIRED` and a token is later configured, those records are eligible immediately instead of waiting another 24 hours.

Expected external failures are recorded on the integration record and counted on the job. A rate limit stops the remainder of that integration cycle rather than blocking the worker indefinitely.

## 10. ClickUp integration

### Discovery

- Recognizes only HTTPS links whose exact host is `app.clickup.com` and path begins with `/t/`.
- Extracts the final task-ID path segment.
- Links untracked `StatusTask` rows to a shared `ClickUpTicket`.

### Imported data

- Ticket ID, title, description, and URL.
- Comments with external ID, text, author, avatar, and timestamp.
- Last attempt, last successful sync, and error.

Rich-text comment links are preserved in the normalized comment text. This matters because GitHub PR links are often stored inside ClickUp comment link attributes.

The client has request serialization, retry handling for rate limits, and a short in-memory cache. ClickUp access is read-only.

## 11. GitHub integration

### Discovery priority

For each task, the first PR URL is selected in this order:

1. Newest ClickUp comments.
2. Task detail bullets.
3. Task description.
4. ClickUp ticket description.
5. Original task URL.

Both full `https://github.com/.../pull/...` links and bare `github.com/.../pull/...` links are normalized.

### Imported data

- Owner, repository, PR number, canonical URL, title, state, draft/merged state.
- Author and avatar.
- Source and target branches.
- Additions, deletions, and changed-file count.
- Per-file status, additions, deletions, change count, previous filename, blob URL, and patch.
- Last attempt, last successful sync, error kind, and error message.

GitHub's file response is paginated at 100 files per request and capped at 3,000 files. `filesTruncated` tells the UI when that limit was reached. Binary or oversized files may have no patch; the UI links to GitHub in that case.

Public repositories can be read without a token. Private repositories need a server-side `GITHUB_TOKEN` with repository access and read-only Pull requests permission.

## 12. Authentication and authorization

- Login verifies the bcrypt password hash.
- The API signs an eight-hour JWT.
- Browser sessions use the HTTP-only `developer_performance_session` cookie.
- Cookies are `SameSite=Lax` and secure in production.
- Middleware also accepts `Authorization: Bearer <token>`.
- Most routes require authentication.
- Developer users can only view/report their own developer data.
- Administrative mutations and integration sync endpoints require `ADMIN`.
- Imported Discord-only users are disabled placeholder accounts until explicitly managed.

## 13. API route map

All routes are under `/api`.

### Health and authentication

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/health` | Process health check |
| POST | `/auth/login` | Create authenticated session |
| GET | `/auth/me` | Read current user |
| POST | `/auth/logout` | Clear session cookie |

### Dashboard and developers

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/dashboard/summary` | Team summary and previous-workday coverage |
| GET | `/developers` | Developer directory |
| GET | `/developers/:id` | Developer details, reports, tasks, latest job |
| PATCH | `/developers/:id` | Update developer; admin only |
| POST | `/developers` | Create developer; admin only |
| POST | `/developers/:id/sync-tasks` | Queue/upgrade a forced single-developer job |
| GET | `/developers/:id/sync-jobs/:jobId` | Poll one job |

### Integrations

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/integrations/discord` | Discord connection/last-sync status |
| POST | `/integrations/discord/parse-preview` | Preview parser output |
| POST | `/integrations/discord/sync-developers` | Discover/link Discord thread developers |
| POST | `/integrations/discord/sync-statuses` | Queue a non-forced job for every linked developer |
| GET | `/integrations/discord/sync-statuses/progress` | Poll a batch of job IDs |

### Projects, reports, tasks

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/projects` | Project catalog |
| GET | `/projects/:id` | One project |
| GET | `/projects/:id/detail` | Project stats and raw tasks |
| POST | `/projects` | Create project; admin only |
| PATCH | `/projects/:id` | Update project/aliases; admin only |
| GET | `/reports` | Daily/monthly/custom performance report |
| GET | `/status-reports` | Query status reports |
| POST | `/status-reports` | Create/update a report with authorization checks |
| GET | `/tasks/:id` | Task and persisted ClickUp details |
| GET | `/tasks/:id/github` | Persisted GitHub PR and file changes |
| PATCH | `/tasks/:id/project` | Manual project assignment; admin only |

Report filters are mutually exclusive:

```text
?date=YYYY-MM-DD
?month=YYYY-MM
?from=YYYY-MM-DD&to=YYYY-MM-DD
```

Administrators may add `developerId`; developer accounts are always restricted to themselves.

## 14. Frontend routes and responsibilities

| Route | Page | Responsibility |
| --- | --- | --- |
| `/login` | `LoginPage` | Authentication |
| `/dashboard` | `DashboardPage` | Team summary and background daily sync |
| `/developers` | `DevelopersPage` | Team list and sync-all progress |
| `/developers/:developerId/edit` | `DeveloperEditPage` | Admin profile editing |
| `/developers/:developerId` | `DeveloperTasksPage` | Developer calendar, tasks, forced sync |
| `/developers/:developerId/tasks/:taskId` | `TaskDetailPage` | Details/ClickUp tab content and GitHub Changes tab |
| `/projects` | `ProjectsPage` | Project catalog |
| `/projects/new` | `ProjectFormPage` | Create project |
| `/projects/:projectId` | `ProjectDetailPage` | Grouped project tasks and total hours |
| `/projects/:projectId/edit` | `ProjectFormPage` | Edit project/aliases |
| `/reports` | `ReportsPage` | Date/month/range performance reports |

`AuthContext` loads `/auth/me`. `AppShell` protects authenticated pages. `api.ts` always sends credentials and converts non-2xx responses to `Error` objects using the API message.

### Task detail tabs

- Details is the initial tab on every task navigation.
- Details contains task bullet details, manual project assignment for admins, ClickUp description, and comments.
- GitHub Changes calls the local `/tasks/:id/github` endpoint lazily.
- GitHub data is already persisted by the worker; opening the tab does not call GitHub directly.
- Patch text is parsed into hunk/context/addition/deletion lines with old/new line numbers.

## 15. Environment variables

Use the root `.env` as the normal local configuration. `config.ts` also checks `apps/api/.env` first when present. Never commit either real environment file.

| Variable | Required | Purpose |
| --- | --- | --- |
| `POSTGRES_DB` | Local Docker | Database name |
| `POSTGRES_USER` | Local Docker | Database user |
| `POSTGRES_PASSWORD` | Local Docker | Database password |
| `DATABASE_URL` | Yes | Prisma connection string |
| `JWT_SECRET` | Yes | JWT signing secret, minimum 16 characters |
| `API_PORT` | No | API port; default 4000 |
| `WEB_ORIGIN` | Yes | Allowed credentialed CORS origin |
| `VITE_API_URL` | Web | Browser API base URL |
| `SEED_ADMIN_EMAIL` | Seed | Admin email |
| `SEED_ADMIN_PASSWORD` | Seed | Admin password |
| `DISCORD_BOT_TOKEN` | Discord | Read-only bot token |
| `DISCORD_GUILD_ID` | Discord | Allowed server ID |
| `DISCORD_STATUS_CHANNEL_ID` | Discord | Allowed parent status-channel ID |
| `CLICKUP_API_TOKEN` | ClickUp | Read-only ticket/comment access |
| `GITHUB_TOKEN` | Private GitHub | Read-only PR/file access |

Do not print secret values in logs, tests, tool output, screenshots, or documentation.

## 16. Local setup

From the repository root in PowerShell:

```powershell
Copy-Item .env.example .env
npm install
npm run db:up
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open:

- Web: `http://localhost:5173`
- API health: `http://localhost:4000/api/health`

The PostgreSQL Docker container is named `developers-performance-postgres` and uses a named volume, so `docker compose down` does not remove data unless the volume is explicitly removed.

## 17. Common commands

```powershell
# Start API + worker + web
npm run dev

# Database
npm run db:up
npm run db:down
npm run db:generate
npm run db:migrate
npm run db:seed
npm run db:studio

# Verification
npm test
npm run typecheck
npm run build
```

Latest verified baseline when this document was created:

- 71 API tests passed.
- 8 web tests passed.
- Type checking passed for both workspaces.
- Production builds passed for both workspaces.

## 18. Safe change workflows

### Database/schema change

1. Edit `apps/api/prisma/schema.prisma`.
2. Add a new migration under `apps/api/prisma/migrations`; do not rewrite applied migrations.
3. Stop API/worker processes before Prisma generation on Windows because the query-engine DLL may be locked.
4. Run `npm run db:generate`.
5. Run the migration.
6. Update API selects, browser types, and documentation.
7. Run tests, typecheck, and build.

Do not use `prisma migrate reset`, drop tables, remove the Docker volume, or clear user data unless explicitly requested.

### Parser change

1. Add the exact Discord input as a test fixture in `discord-status-parser.test.ts`.
2. Assert project name, task heading, details, time total, URL, and ordering.
3. Update only `status-parser.ts` unless project matching is the actual issue.
4. Run all parser and API tests because parser regressions can silently rewrite imported task rows.

### Integration change

1. Keep external calls in `integrations/<provider>/service.ts`.
2. Keep persistence/freshness logic in `integrations/<provider>/sync.ts`.
3. Keep secrets in server config only.
4. Preserve developer scoping and force-versus-24-hour behavior.
5. Serialize provider cycles so scheduled and manual work cannot overlap unsafely.
6. Store expected errors and expose a normal UI state; reserve job `FAILED` for fatal pipeline errors.

### Frontend API change

1. Add/update the Express response.
2. Update `apps/web/src/types.ts` manually; there is no generated API client.
3. Update `apps/web/src/lib/api.ts`.
4. Update the page and shared CSS.
5. Add a unit test for extractable logic.
6. Run web typecheck/build to catch contract drift.

## 19. Operational and implementation cautions

- This repository may have user changes in progress. Inspect `git status` and never revert unrelated changes.
- The user prefers to run `npm run dev` in their own terminal to see logs. If a temporary validation server is started, stop it before handing back unless asked otherwise.
- On Windows, identify the exact project process tree before stopping it. Do not terminate unrelated Node/Codex processes.
- The API and worker both use the same Prisma client/database.
- A task can share a ClickUp ticket or GitHub PR with tasks from other developers.
- Shared integration records may be refreshed during the first eligible developer job and then skipped as fresh for later global jobs.
- `lastSyncAttemptAt`, not page-open time, drives the 24-hour policy.
- Without `GITHUB_TOKEN`, private PRs normally record `AUTH_REQUIRED`. Adding the token and restarting makes those records immediately eligible.
- GitHub and ClickUp rate limits stop the remainder of that provider cycle; counters and errors must remain visible.
- Dates are stored as UTC date values. Business-day calculations use `Asia/Karachi` unless a developer-specific timezone is explicitly relevant.
- `styles.css` is intentionally shared and currently contains the full application design system.
- API source uses ESM/NodeNext. Relative TypeScript imports in `apps/api` must use the `.js` extension.

## 20. Future-agent startup checklist

Before changing code:

1. Read this file.
2. Read `git status --short` and preserve all existing work.
3. Inspect only the files relevant to the request; use this map instead of scanning the whole repository.
4. Check whether the user's dev server is running before starting/stopping processes.
5. Confirm whether the requested action is read-only, a code change, a data mutation, or a destructive reset.
6. For sync issues, inspect the job's `status`, `phase`, `forceRefresh`, counters, and `error` before changing logic.
7. For wrong task parsing, reproduce the exact Discord text in a parser test first.
8. For missing GitHub data, check task-to-PR linkage, `syncErrorKind`, token configuration, rate limits, and last attempt time.
9. For missing ClickUp data, check the exact task URL host/path, link field, last attempt, and saved sync error.
10. Finish by running proportionate tests, typecheck, and build, then report whether the server was left running or stopped.

## 21. Documentation maintenance

Update `AGENTS.md` when any of these change:

- Queue phases, force policy, freshness interval, or scheduling.
- Discord status format/parsing rules.
- Project matching/grouping behavior.
- Prisma models or relationship semantics.
- API or frontend routes.
- Environment variables or external permissions.
- Task detail tabs or persisted integration behavior.
- Standard run/test/migration commands.

Keep this file architectural and durable. Do not store tokens, passwords, temporary PIDs, individual developer data, or transient debugging output here.
