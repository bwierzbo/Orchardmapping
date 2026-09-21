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
npx tsx scripts/import-trees.ts <orchard-id> <file.csv|.json>   # add "--dry-run" to preview
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
- **An orchard is a tenant** (migration 048): `orchard_members` maps a Clerk user id to a role — `viewer` < `operator` < `admin` (`lib/roles.ts`, matching CiderPilot's `user_role`). Membership is the access check everywhere; being signed in grants nothing.
- Guards live in `lib/orchard-access.ts`: `requireOrchardAccess()` / `requireTreeAccess()` in REST routes (return a `NextResponse` on denial), `assertOrchardAccess()` / `assertTreeAccess()` in tRPC, `viewerRole()` in server components, `memberOrchardIds()` to scope a listing. A route that takes an orchard or tree id and skips these is public to every signed-in user.
- Invitations (`orchard_invitations`) are keyed by **email**, because a Clerk user id does not exist until first sign-in; they are claimed lazily on the first access miss. An existing membership wins — re-accepting an old invitation never changes a role.
- **Global levels** (`global_members`, migration 051) apply to every orchard including ones created later — the few people who run the system. Same three role names. A person's level on an orchard is the **higher** of their global level and their membership: per-orchard can raise, never lower, so an orchard's owner cannot lock out support. `globalRole()` / `isGlobalAdmin()`, and `globalAdminProcedure` for tRPC; the console is `/access`, linked from the home page for global admins only.
- **Creating an orchard makes the creator its admin**, in the same transaction (`insertOrchardFull`, which takes the owner as a required argument). Membership is the only thing granting access, so an orchard created without one is invisible to everybody. It also allocates `site_id` and `code` — both NOT NULL and permanent, since they are baked into every tree id (`lib/db/sites.ts`).
- Gates answer **NOT_FOUND, not FORBIDDEN**, for things a person may not use — a page or procedure should not confirm that someone else's orchard, or the access console, exists.
- Env: `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login`, `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/`.

### API convergence (Sept 2026, in progress)
This app is being aligned with CiderPilot (see the cidery repo's practices).
- **tRPC** lives at `/api/trpc` (`lib/trpc/`): `orchard.list/get`, `tree.list/get/events`, `tree.logEvent`. Reads + event logging are live; the REST routes below remain the write path until the viewer's mutations are switched over.
- **Drizzle schema** in `lib/db/schema.ts` + client in `lib/db/drizzle.ts` (over the same @vercel/postgres pool). SQL migrations stay the DDL source of truth; the raw-SQL modules are being ported to Drizzle incrementally.
- **Inspections** (`app/orchard/[id]/viewer/InspectionEntry.tsx`): the one per-tree form + `saveInspection()` used by both Walk Mode and the tree panel's Inspect button — health (status update + observation with the stressed key issue / note), bloom and fruit_check events. Don't add a second bloom/fruit entry path.
- **Walk survey progress** (`lib/walk-progress.ts`, `/api/walk-progress`): a paused walk is saved per orchard in localStorage and mirrored into `app_settings` (`walk_progress:<orchard>`), reconciled by `updatedAt`; the route itself comes from `lib/serpentine.ts` (`walkPathFrom`).
- **tree_events** (`lib/db/tree-events.ts`, migration 006): per-tree audit + field-activity log. The tree API routes auto-write created/updated/status_change/moved/deleted events (best-effort — audit failure never fails the edit); manual events via `POST /api/trees/[id]/events`. No FK on tree_id so history survives deletion.

### Data layer (raw SQL, no ORM)
- `@vercel/postgres` tagged-template `sql` everywhere; dynamic UPDATEs via `buildUpdateSet()` (`lib/db/sql-helpers.ts`) against the column whitelists `TREE_UPDATABLE_COLUMNS` / `ORCHARD_UPDATABLE_COLUMNS` — **never interpolate request-supplied column names**.
- Tables: `sites` (a grower; holds orchards), `orchards` (config lives in DB, not code — id is a slug of the name; carries `site_id`, `code`, `next_tree_no`), `trees`, `_migrations`.

### Tree identity vs. tree address (migration 049) — read before touching trees
- **`tree_id` is permanent and opaque**: `OBC-001-0142` = site code, orchard code, tree number. Issued once by `allocateTreeIds()` (`lib/db/trees.ts`), which bumps `orchards.next_tree_no` in the same statement it reads. **Never regenerate it, never derive it from anything, never parse it.** Numbers are never reused, even after a delete.
- `trees.tree_no` is the same number as a column — that is what the UI shows ("Tree 142"). `trees.legacy_tree_id` holds the pre-049 address-shaped id so old links and exports still resolve; `getTreeById()` falls back to it.
- **The address is `block_id` + `row_id` + `position`, all nullable and all freely editable.** A tree may be in a block with no row, a row with no block, or unplaced (all three NULL) — which is what a newly discovered tree is.
- `lib/address.ts` is the single definition of address semantics (`normalizeAddress`, `addressKey`, `formatAddress`, `formatTreeLabel`) and is client-safe. An absent part is **NULL, never `''`**.
- Uniqueness is `UNIQUE (orchard_id, address_key) DEFERRABLE`, where `address_key` is a generated column that is NULL for an unplaced tree (so any number of unplaced trees may coexist). Bulk paths `SET CONSTRAINTS trees_orchard_address_uniq DEFERRED` so a swap or a shift-the-row-by-one succeeds in one transaction.
- Moving a tree goes through `setTreeAddress()` / tRPC `tree.setAddress`, which checks the spot is free and logs a `moved` event. `update` deliberately ignores address fields so there is one path that does those things.
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
