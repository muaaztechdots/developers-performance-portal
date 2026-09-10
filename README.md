# Developers Performance

An npm-workspaces monorepo for collecting developer daily status reports.

## Stack

- `apps/web`: React, Vite, TypeScript, React Router
- `apps/api`: Node.js, Express, TypeScript, Prisma
- PostgreSQL 17 through Docker Compose

## Run locally

1. Create the local environment files:

   ```powershell
   Copy-Item .env.example .env
   Copy-Item apps/api/.env.example apps/api/.env
   ```

2. Install dependencies and start PostgreSQL:

   ```powershell
   npm install
   npm run db:up
   ```

3. Create the schema and seed the first admin:

   ```powershell
   npm run db:migrate
   npm run db:seed
   ```

4. Start both applications:

   ```powershell
   npm run dev
   ```

Open <http://localhost:5173>. The default seed credentials are `muaaz@techdots.dev` / `Admin@123`; change them in `apps/api/.env` before seeding outside local development.

## Status data model

One `StatusReport` belongs to a developer and a calendar date. Its `StatusTask` rows represent yesterday/today items. A task always has a description, while `durationMinutes` and `taskUrl` are nullable. Project name, workflow status, notes, and ordering are also stored without flattening the original update into a single text field.

## Useful commands

```powershell
npm run build
npm run typecheck
npm test
npm run db:studio
npm run db:down
```

The API health endpoint is <http://localhost:4000/api/health>.
