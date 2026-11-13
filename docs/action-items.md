# OrchardMap — Action Items

*First written 13 November 2026, from an audit of the code. There was no list before this one.*

How to read this: **Next** is the order to work in. **Open** is everything unfinished, with the evidence. Items move to **Done** with a note of what was changed.

---

## Next (in order)

| Order | Item | Why now | Size |
|---|---|---|---|
| — | ~~**1–5** Close the cross-orchard holes~~ | Fixed 13 November 2026 on the working branch; see Done. Not yet merged or deployed. | — |
| 2 | **10** Tests for the access guards | The whole tenant boundary (`lib/orchard-access.ts`) has no tests, which is how 1–5 went unnoticed. The fixes for 1–5 test their input rules only; the guards themselves need a test database. | Medium |
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

Found by reading every route, procedure and page: 30 REST handlers, 73 tRPC procedures, 23 pages. Items 1–5, the cases where one orchard's member could write to or read another orchard, are fixed and listed under Done. The instance is invite-only, so the people able to do these are people who were invited.

| # | Severity | Where | What is exposed | To whom |
|---|---|---|---|---|
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

### 1–5 — Cross-orchard holes, fixed 13 November 2026

Checked with typecheck, lint and the unit tests (952 passing). Not exercised against a database: the rules that read input are unit-tested in `lib/tenant-input.test.ts`; the queries are not.

| # | Was | What was changed |
|---|---|---|
| 1 | Any signed-in user could undo any orchard's group action by its number. | `app/api/group-actions/[id]/undo/route.ts` now looks up the action's orchard (`groupActionOrchard`, new in `lib/db/group-actions.ts`) and requires operator access to it before reverting anything. Someone outside the orchard gets "Action not found", the same as for a number that does not exist. |
| 2 | An operator of one orchard could create trees in another by sending `orchardId` and `orchard_id` with different values. | The guard in `lib/trpc/init.ts` now refuses a request whose two spellings disagree (`namedOrchardId`, new in `lib/tenant-input.ts`), which covers every orchard-guarded procedure, not only this one. `tree.create` also writes to the orchard the guard checked instead of the one in the body. |
| 3 | An operator of one orchard could write pest observations into another; and logging a sighting from a pest's page, which sends no tree, was refused outright. | `pest.observe` is now guarded by the orchard it writes to. A tree, when named, must stand in that orchard (`treeInOrchard`, new in `lib/orchard-access.ts`). The sighting is written to the checked orchard. The pest-page form works again as a side effect. |
| 4 | An operator of one orchard could create or overwrite trap counts in another. | `trap.recordCounts` checks every trap id against the orchard (`trapsOutsideOrchard`, new in `lib/db/traps.ts`) before writing any count, and refuses the whole round if one is foreign. |
| 5 | A viewer of one orchard could read any tree's latest observations. | `tree.lastObservation` is now guarded by the tree it reads, not by the orchard named beside it. |

### Earlier

Recent shipped work is in the commit history (#66–#91: harvest targets and calendar, per-tree harvest, walk surveys, tree replacement, grafts).
