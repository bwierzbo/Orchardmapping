# OrchardMap — Action Items

*First written 13 November 2026, from an audit of the code. There was no list before this one.*

How to read this: **Next** is the order to work in. **Open** is everything unfinished, with the evidence. Nothing here has been fixed yet — this file only records what was found.

---

## Next (in order)

| Order | Item | Why now | Size |
|---|---|---|---|
| 1 | **1–5** Close the cross-orchard holes | A signed-in person can change or read another orchard's data in five places. | Small each |
| 2 | **10** Tests for the access guards | The whole tenant boundary (`lib/orchard-access.ts`) has no tests, which is how 1–5 went unnoticed. | Medium |
| 3 | **6** Decide what the variety pages show the public | They are open to anyone and list every grower's site name. | Small |
| 4 | **7–9** Lesser access gaps | Global walk settings, upload tokens, weather ingest token. | Small each |
| 5 | **11** Correct `CLAUDE.md` and the README | Five statements in the project guide are wrong, and it is what every future change is written from. | Small |
| 6 | **20** CiderPilot link, OrchardMap side | Waits on CiderPilot's inbox; builds on a clean access layer. | Medium |
| 7 | **12** Finish the move to tRPC | Thirteen REST routes still carry writes; four are dead. Each REST write route is one more place a guard can be forgotten (item 1 was one). | Medium |
| 8 | **13** Region settings that are recorded but unread | The region card promises settings the models do not use. | Medium |
| 9 | **14, 15** Clear out stale docs and scripts | Eleven docs describe a system that no longer exists. | Small |
| 10 | **16** Drizzle: commit or drop | Declared the end state, used by nothing. | Decision first |

---

## Open

### Access — one orchard reaching another

Found by reading every route, procedure and page: 30 REST handlers, 73 tRPC procedures, 23 pages. Items 1 and 2 were re-read by hand and confirmed. The instance is invite-only, so the people able to do these are people who were invited.

| # | Severity | Where | What is exposed | To whom |
|---|---|---|---|---|
| 1 | High | `app/api/group-actions/[id]/undo/route.ts:17` → `lib/db/group-actions.ts:365` | Undo any orchard's group action by its number: reverts tree edits, hides harvest records and events. Only a session is checked; the action's orchard never is. | Any signed-in user, member of nothing |
| 2 | High | `lib/trpc/router.ts:309` (`tree.create`), `lib/trpc/init.ts:73` | Create trees in another orchard, using up its permanent tree numbers. The guard checks `orchardId` if sent; the insert uses `orchard_id`. Send both and they can differ. | An operator of any one orchard |
| 3 | High | `lib/trpc/router.ts:991` (`pest.observe`) → `lib/db/pests.ts:141` | Write pest observations, with notes and photos, into another orchard. Only the tree is checked; the orchard written to comes from the request. Also makes an observation without a tree impossible. | An operator of any one orchard |
| 4 | Medium | `lib/trpc/router.ts:1340` (`trap.recordCounts`) → `lib/db/traps.ts:171` | Create or overwrite trap counts in another orchard, which can trip that orchard's spray thresholds. The orchard is checked, each trap is not. | An operator of any one orchard |
| 5 | Medium | `lib/trpc/router.ts:512` (`tree.lastObservation`) → `lib/db/last-observation.ts:46` | Read any tree's latest fruit check, observation, condition and bloom. | A viewer of any one orchard |
| 6 | Medium | `app/varieties/page.tsx:36`, `app/varieties/[name]/page.tsx:96`, `lib/db/varieties.ts:198` | Every grower's site name with tree counts per variety; counts summed across all orchards; site-scoped variety observations (juice chemistry). | Anyone, not signed in |
| 7 | Low | `app/api/settings/route.ts:9,22` | Read (no sign-in) and rewrite the walk settings every orchard shares. | Any signed-in user |
| 8 | Low | `app/api/weather/ingest/route.ts:38` | One shared token for all orchards, also accepted in the URL (so it reaches logs); the orchard comes from the request. On-site weather outranks every other source for scab and leaf wetness. | Anyone holding the token |
| 9 | Low | `app/api/photos/upload/route.ts:20`, `app/api/orchards/upload/route.ts:21`, `app/api/trees/[id]/harvest/route.ts:100` | Upload tokens issued on a session alone, for any orchard's path (15 MB photos, 1 GB tiles). The harvest route stores a photo URL without the Blob-host check the events route applies. | Any signed-in user |

Checked and sound: every page under `/orchard/[id]`; listings on home, harvest and trees; member and invitation actions; grafts, events, photos, areas, spray applications, phenology marks; non-members always get "not found". One judgement call: `spray.setMode` (`router.ts:818`) switches certified-organic mode at operator level and arguably belongs with the admin-only settings.

### Foundations

| # | Item | What was found | What to do |
|---|---|---|---|
| 10 | Tests for the access guards | `lib/orchard-access.ts` (245 lines) has no test. Untested: the "higher of global and member role" rule, lazy invitation claiming, and every guard. Also untested: `lib/trpc/`, `app/api/`, `allocateTreeIds`, grafts, tree harvests, group actions, `lib/dates.ts`. | Guard tests first, including one per hole in 1–5 so they cannot return. |
| 11 | `CLAUDE.md` and README are wrong | **(a)** tRPC is described as six procedures with REST as the write path; it is 14 routers and tree edits already use it. **(b)** `setTreeAddress()` / `tree.setAddress` do not exist; moves go through `tree.editMany`. **(c)** "Domain conventions" says ids are `<orchardId>-R01-P001` from `generateTreeId` and to keep `lib/row-id.ts` in sync; neither exists. **(d)** "Wired so far: the chill window only" — wetness proxies are wired too. **(e)** "Raw SQL, no ORM" sits beside a Drizzle section. **(f)** It recommends `export-current-trees.ts`, which rejects every current orchard. **(g)** README: "Maps are public" — viewing needs membership; "manage collaborators from the Clerk dashboard" ignores the members and access consoles. | Correct both files. |
| 12 | Finish the move to tRPC | **Dead, no caller:** `/api/trees`, `/api/trees/[id]`, `/api/harvests`, `/api/orchards/config`. **Live, to move:** tree events (tRPC twins exist, unused), harvest, harvest-complete, photos delete, bulk-update, group actions and undo, settings, walk progress, orchard create and create-point, geocode. **Stay REST:** the two Blob upload-token routes and weather ingest. About a dozen tRPC procedures have no caller. One router is still named `program2`. | Delete the dead four; move the rest so every write passes one guard layer. |
| 16 | Drizzle: commit or drop | No module queries through it. `lib/db/schema.ts` models 4 of 40 tables, and its `orchards` is missing ten columns added since. All 29 data modules use raw SQL. | Decide. If the raw SQL is staying, remove the schema file and the claim; a half-true schema is worse than none. |

### Agronomy

| # | Item | What was found | What to do |
|---|---|---|---|
| 13 | Region settings recorded but unread | **Wired:** chill window; scab wetness proxies. **Half:** codling-moth accumulation is applied once, when a program is adopted — existing programs are never re-adapted, and the dashboard's milestones (`lib/gdd.ts:56`) and historical average (`lib/db/weather.ts:129`) always count from 1 January. **Unread:** number of codling-moth generations (second generation is hardcoded, `gdd.ts:60`); scab inoculum (the scab model has no such input). | Wire or label each; today the card shows values that change nothing. |
| 17 | Deferred decisions, recorded in the code | Membership per orchard or per site (`049`). Forecast infection events not wired (`lib/db/schedule.ts:143`). Two-station weather blending assumed linear until a season of both exists (`lib/weather-source.ts:150`). Modelled leaf wetness off pending the AgWeatherNet sensor (`lib/scab.ts:129`). Time zone falls back to Los Angeles (`lib/db/orchards.ts:127`). Husmann rootstock: ELMA 06 or EMLA 106, awaiting the owner (`scripts/backfill-husmann.ts:5`). | Owner decisions; none blocks other work. |

### Clearing out

| # | Item | What was found | What to do |
|---|---|---|---|
| 14 | Stale docs | Describe NextAuth, old id formats, deleted orchards or missing scripts: `API-ORCHARD-UPLOAD`, `EASIEST-QGIS-WORKFLOW`, `MINIMAL-QGIS-WORKFLOW`, `ORCHARD-UPLOAD-UI`, `PROMPTS-4-5-SUMMARY`, `QGIS-TREE-MAPPING`, `REGENERATE_PMTILES`, `TREE-API-DOCUMENTATION`, `TREE-EDITING-GUIDE`, `UPLOAD-API-SUMMARY`. Partly useful: `PMTILES_TROUBLESHOOTING`, `scripts/README.md`. | Delete or rewrite; keep the PMTiles protocol notes. |
| 15 | Scripts | **Finished one-offs:** `rename-orchards-2026-09`, `fix-mantooth-sequence-2026-10`, `backfill-provenance` (both), `import-finnhall-varieties`, `sync-homeorchard-sheet`, `seed-homeorchard-areas`, `upload-manytrees`, `cleanup-orchards`, and `backfill-husmann` once item 17 is answered. **Broken:** `export-current-trees` (only accepts three deleted orchards), `check-config` (hardcoded to one), `check-program-coverage` (reads a deprecated column), `test-orchard` (raw insert, may skip the required owner and site). | Archive the first group; fix or delete the second. |
| 18 | Drop `pest_library.prevalence` | Migration 056 promised to drop it later. The app no longer reads it; one script does. | A migration, after fixing the script. |

### Integration

| # | Item | Status | What to do here |
|---|---|---|---|
| 20 | CiderPilot link | Designed 2026-11-13, not started. Full summary is item 25 in CiderPilot's `docs/cidery-app-action-items.md`. | Send each pick (and its edits and undos) to CiderPilot's inbox, keyed by harvest id. Show received weight and yield beside picks. Show and edit price only for people CiderPilot confirms are cidery staff; nobody else, including the orchard's own admin, sees it. Queue a price entered without signal and apply it only if nothing newer was saved. Later: send predicted pick dates and tree counts per variety for CiderPilot's planning. |

---

## Done

Nothing yet — this list starts here. Recent shipped work is in the commit history (#66–#91: harvest targets and calendar, per-tree harvest, walk surveys, tree replacement, grafts).
