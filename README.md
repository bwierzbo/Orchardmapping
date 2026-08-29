# Orchard Map

Drone-mapped orchards with a record for every tree. High-resolution
orthomosaic imagery (flown with a drone, stitched with OpenDroneMap) is
served as PMTiles and rendered with MapLibre GL; every tree is a database
row with variety, health status, row/position, and history.

**Live:** https://orchardmapping.vercel.app

## Architecture

- **Next.js (App Router)** on Vercel — pages, API routes, and a `proxy.ts`
  auth gate for the protected paths.
- **MapLibre GL + PMTiles** — each orchard's orthomosaic is a single
  `.pmtiles` archive read directly from Blob storage via HTTP range
  requests; no tile server.
- **Vercel Blob** — stores PMTiles archives and preview images under
  `orchards/<id>/...`.
- **Neon Postgres** (via `@vercel/postgres`) — orchard configuration
  (bounds, zooms, tile URLs) and tree records.
- **Auth.js v5 (NextAuth)** — credentials login backed by a `users` table
  (bcrypt). Roles: `admin` (user management), `operator` (edit data),
  `viewer` (read-only). Maps are public; editing requires a login.

## Local development

```bash
pnpm install
cp .env.example .env.local     # fill in real values (see table below)
pnpm db:migrate                # apply lib/db/migrations/*.sql
pnpm db:seed-admin             # create the first admin user
pnpm dev
```

| Variable | Purpose |
| --- | --- |
| `POSTGRES_URL` / `DATABASE_URL` | Neon Postgres connection string |
| `AUTH_URL` | Base URL for auth callbacks (`http://localhost:3000` in dev) |
| `AUTH_SECRET` | Session signing secret (`openssl rand -base64 32`) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob store token |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | Only read by `pnpm db:seed-admin` |

Checks: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

## Adding an orchard

1. Fly the orchard and build an orthomosaic (OpenDroneMap/WebODM).
2. Produce a PMTiles archive: GeoTIFF → tiles (`gdal2tiles`/QGIS) →
   MBTiles → `pmtiles convert ortho.mbtiles ortho.pmtiles`. Verify with
   `pmtiles show` that bounds/zooms/tile type are sane.
3. Sign in and use **Add New Orchard** — the file uploads from your
   browser straight to Blob storage, the header is validated, and the
   orchard row is created with bounds/zooms from the archive.
4. Import trees from CSV via the map page's **Import Tree Data** (see
   `public/templates/tree-data-template.csv` and `docs/` for the QGIS
   workflow that generates tree positions).

## Database

Schema lives in `lib/db/migrations/` (applied by `pnpm db:migrate`, which
tracks state in a `_migrations` table). Key tables: `orchards` (config +
tile URLs), `trees` (one row per tree, `UNIQUE (orchard_id, row_id,
position)`), `users`, `tree_health_logs`.

## Known limitations

- Sessions are JWT-only (7-day expiry); deactivating a user does not
  revoke an existing session immediately.
- Bulk import is CSV-only (the `xlsx` package was dropped for unpatched
  security advisories) — export a CSV from Excel/Sheets/QGIS.
- Preview deployments share the production database.
