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
- **Clerk** — hosted authentication (native Vercel Marketplace
  integration). Maps are public; editing requires a login. The Clerk
  instance is invite-only: manage collaborators (and revoke access
  instantly) from the Clerk dashboard.

## Local development

```bash
pnpm install
vercel link && vercel env pull --yes .env.local   # or fill in .env.example by hand
pnpm db:migrate                # apply lib/db/migrations/*.sql
pnpm dev
```

| Variable | Purpose |
| --- | --- |
| `POSTGRES_URL` / `DATABASE_URL` | Neon Postgres connection string |
| `CLERK_SECRET_KEY` / `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk keys (auto-provisioned by the Vercel integration) |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/login` |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob store token |

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
position)`), `tree_health_logs`. (The legacy `users` table is unused
since the move to Clerk.)

## Known limitations

- Bulk import is CSV-only (the `xlsx` package was dropped for unpatched
  security advisories) — export a CSV from Excel/Sheets/QGIS.
- Preview deployments share the production database.
