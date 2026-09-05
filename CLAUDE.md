# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Orchard mapping platform for precision cider-orchard management: drone orthomosaic imagery (PMTiles) with tree-level data on an interactive MapLibre map. Next.js 16 (App Router) + React 19, deployed on Vercel; Neon Postgres via `@vercel/postgres`, tiles in Vercel Blob, auth via Clerk (invite-only instance).

## Commands

```bash
pnpm dev              # Dev server (localhost:3000)
pnpm build            # Production build
pnpm typecheck        # tsc --noEmit  (NOTE: scripts/ is excluded from tsconfig)
pnpm lint             # eslint .
pnpm test             # vitest run — pure-function unit tests colocated in lib/ (*.test.ts)
pnpm db:migrate       # Run SQL migrations (lib/db/migrations/) — add "-- --status" for a dry list

# Data utilities (each loads .env.local via dotenv)
npx tsx scripts/import-trees-csv-autoid.ts <orchard-id> <csv>   # row_id,position,X,Y — auto tree IDs
npx tsx scripts/import-trees-csv.ts <orchard-id> <csv>          # CSV with explicit tree_id
npx tsx scripts/export-current-trees.ts <orchard-id> [csv|json]
npx tsx scripts/set-preview.ts <orchard-id> <image-path>
npx tsx scripts/check-database.ts
```

First-time setup: `vercel env pull --yes .env.local` (a stale `.env.local` with NextAuth-era vars will NOT work — Clerk + Blob keys are required).

CI (`.github/workflows/ci.yml`) runs typecheck, lint, test, build on every PR — all four must pass.

## Architecture

### Auth (Clerk)
- `proxy.ts` (Next 16's middleware file — there is **no `middleware.ts`**) runs `clerkMiddleware()`; only `/orchards/new` is matcher-protected.
- **Every mutating API route must call `requireSession()` from `lib/api-auth.ts` itself** (returns 401 JSON); forgetting it makes the route public.
- No roles: the Clerk instance is invite-only, any signed-in user is a trusted collaborator. (The `users` table from migration 002 and "operator/admin" doc-comments are dead legacy.)
- Env: `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login`, `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/`.

### Data layer (raw SQL, no ORM)
- `@vercel/postgres` tagged-template `sql` everywhere; dynamic UPDATEs via `buildUpdateSet()` (`lib/db/sql-helpers.ts`) against the column whitelists `TREE_UPDATABLE_COLUMNS` / `ORCHARD_UPDATABLE_COLUMNS` — **never interpolate request-supplied column names**.
- Tables: `orchards` (config lives in DB, not code — id is a slug of the name), `trees` (`tree_id` unique; `UNIQUE (orchard_id, row_id, position)`; status CHECK), `tree_health_logs` (written by nothing yet), `_migrations`.
- DECIMAL columns come back **as strings** — decode via `lib/db/decode.ts` (`decodeTreeRow`/`toNum`).
- `tile_min_zoom`/`tile_max_zoom` are INTEGER — round before insert.
- Bulk import: `bulkUpsertTrees` (chunked, transactional, `COALESCE` on conflict so sparse CSVs never wipe fields).
- Dates: YYYY-MM-DD strings pass to Postgres verbatim; **never** `toISOString().split('T')[0]` (see `lib/dates.ts` — timezone day-shift).
- Env: `POSTGRES_URL` (implicit via `@vercel/postgres`), `BLOB_READ_WRITE_TOKEN`. Preview deployments share the production database.

### Map (MapLibre GL + PMTiles)
- Tiles live in **Vercel Blob** (`orchards/<id>/ortho|vector|preview/…`), not the repo; `*.pmtiles` is gitignored.
- `lib/pmtiles-protocol.ts` — idempotent protocol registration; returns a transparent 1×1 PNG for gaps in sparse archives (otherwise MapLibre hangs in `loading`). This and the requirement that `pmtiles://` URLs be **absolute** (`lib/map-style.ts` `pmtilesSourceUrl`) are the two historic causes of "stuck tiles".
- Trees render as a clustered **GeoJSON layer** (`lib/trees-geojson.ts` + `app/orchard/[id]/viewer/useTreeLayer.ts`), not DOM markers; hover/selected/drag via feature-state keyed on numeric DB id.
- Viewer hooks in `app/orchard/[id]/viewer/`: `useTrees` (optimistic CRUD — single source of truth), `useTreeLayer`, `useUrlState` (selected tree in `?tree=`, camera in `#map=z/lat/lng` hash so panning never re-runs RSC). `OrchardViewerLoader` dynamic-imports the viewer `ssr:false` to keep maplibre out of the shell.
- No external basemap by design — plain background + orthomosaic raster.

### Domain conventions
- Tree IDs are generated **server-side only**: `<orchardId>-R01-P001` (`generateTreeId` in `lib/db/trees.ts`). Row ids are normalized (`"01"` → `"1"`) — keep `lib/row-id.ts` in sync with the server.
- Statuses (single source `TREE_STATUSES` in `lib/types.ts`): healthy `#1F9D4D`, stressed `#DB9E00`, dead `#C0392B`, unknown `#7C8894`. Status UI always pairs color with a label/dot — never color-only.
- New orchard flow: OpenDroneMap → GeoTIFF → MBTiles → `pmtiles convert` → sign in → Add New Orchard (browser uploads direct to Blob, then `POST /api/orchards/create` reads the PMTiles header for bounds/zooms).

### Design system — "Conifer & Flag"
- Tokens are CSS custom properties (RGB triplets) in `app/globals.css` (`:root` light / `.dark`), mapped into Tailwind (`tailwind.config.js`): `ink`, `paper`, `surface`, `canopy-*`, `bark`, `flag-*`, `line`, `status.*`.
- Dark mode: Tailwind `class` strategy + `next-themes` (`defaultTheme="system"`); toggle in `UserMenu`.
- Fonts: Fraunces (`font-display`), Archivo (`font-sans`), IBM Plex Mono (`font-mono`). `.survey-caption` (mono uppercase) is the signature metadata style.
- New UI should use tokens, not hardcoded colors, and must work in both themes.

## Gotchas

- `proxy.ts` not `middleware.ts`; API auth is per-route (`requireSession()`).
- `scripts/` is excluded from typecheck — errors there won't fail `pnpm typecheck`.
- Several `docs/` pages predate the Clerk migration (they mention NextAuth cookies, admin credentials, `.xlsx` import, a `WA-R01-P01` id format, and orchards/scripts that no longer exist) — trust the code over `docs/` and `scripts/README.md`.
- CSV import only — `xlsx` was removed for security advisories; don't reintroduce it.
- Every DB-reading page sets `export const dynamic = 'force-dynamic'`.
- Deploy config is in `next.config.mjs` (no `vercel.json`): Blob image remotePatterns and the `.pmtiles` headers rule (immutable 1-year cache, CORS `*`).
- `.gitignore` has a broad `.env*` — new env docs belong in the already-tracked `.env.example`.
