/**
 * Drizzle schema — mirrors the SQL migrations in lib/db/migrations/
 * (which remain the source of truth for DDL; this file is the typed
 * query-builder view of the same tables, CiderPilot-style).
 */
import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  decimal,
  date,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

/** A grower or operation; one site may hold several orchards. */
export const sites = pgTable('sites', {
  id: text('id').primaryKey(),
  /** Short permanent code baked into every tree id at this site: "OBC". */
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const orchards = pgTable('orchards', {
  id: varchar('id', { length: 50 }).primaryKey(),
  name: varchar('name', { length: 200 }).notNull(),
  siteId: text('site_id')
    .notNull()
    .references(() => sites.id),
  /** Ordinal within the site ("001"). Permanent: it is part of every tree id. */
  code: text('code').notNull(),
  /** Next tree number to hand out; only ever increases. */
  nextTreeNo: integer('next_tree_no').notNull().default(1),
  location: varchar('location', { length: 300 }),
  description: text('description'),
  centerLat: decimal('center_lat', { precision: 10, scale: 8 }),
  centerLng: decimal('center_lng', { precision: 11, scale: 8 }),
  boundsMinLng: decimal('bounds_min_lng', { precision: 11, scale: 8 }),
  boundsMinLat: decimal('bounds_min_lat', { precision: 10, scale: 8 }),
  boundsMaxLng: decimal('bounds_max_lng', { precision: 11, scale: 8 }),
  boundsMaxLat: decimal('bounds_max_lat', { precision: 10, scale: 8 }),
  defaultZoom: decimal('default_zoom', { precision: 4, scale: 2 }),
  minZoom: decimal('min_zoom', { precision: 4, scale: 2 }),
  maxZoom: decimal('max_zoom', { precision: 4, scale: 2 }),
  tileMinZoom: integer('tile_min_zoom'),
  tileMaxZoom: integer('tile_max_zoom'),
  orthoPmtilesUrl: text('ortho_pmtiles_url'),
  vectorPmtilesUrl: text('vector_pmtiles_url'),
  previewImageUrl: text('preview_image_url'),
  orthoApiPath: text('ortho_api_path'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const trees = pgTable(
  'trees',
  {
    id: serial('id').primaryKey(),
    /** Permanent and opaque (OBC-001-0142); never derived from the address. */
    treeId: varchar('tree_id', { length: 100 }).notNull(),
    /** Human-facing number within the orchard, matching the id's tail. */
    treeNo: integer('tree_no'),
    /** The address-shaped id this tree carried before migration 049. */
    legacyTreeId: text('legacy_tree_id'),
    orchardId: varchar('orchard_id', { length: 50 })
      .notNull()
      .references(() => orchards.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }),
    variety: varchar('variety', { length: 100 }),
    fruitType: text('fruit_type'),
    status: varchar('status', { length: 20 }).default('healthy'),
    plantedDate: date('planted_date'),
    // The address: every part optional and freely editable (migration 049).
    blockId: varchar('block_id', { length: 50 }),
    rowId: varchar('row_id', { length: 50 }),
    position: text('position'),
    age: integer('age'),
    height: decimal('height', { precision: 5, scale: 2 }),
    lat: decimal('lat', { precision: 10, scale: 8 }),
    lng: decimal('lng', { precision: 11, scale: 8 }),
    lastPruned: date('last_pruned'),
    lastHarvest: date('last_harvest'),
    yieldEstimate: decimal('yield_estimate', { precision: 8, scale: 2 }),
    notes: text('notes'),
    rootstock: varchar('rootstock', { length: 100 }),
    source: varchar('source', { length: 200 }),
    acquiredDate: date('acquired_date'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('trees_tree_id_key').on(t.treeId),
    uniqueIndex('trees_orchard_tree_no_uniq').on(t.orchardId, t.treeNo),
    // The real constraint is on the generated address_key column and is
    // DEFERRABLE, which Drizzle cannot express; the SQL migration owns it.
  ]
);

export const treeEvents = pgTable(
  'tree_events',
  {
    id: serial('id').primaryKey(),
    // Deliberately NOT an FK — history must survive tree deletion
    treeId: varchar('tree_id', { length: 100 }).notNull(),
    orchardId: varchar('orchard_id', { length: 50 }).notNull(),
    eventType: varchar('event_type', { length: 30 }).notNull(),
    eventDate: date('event_date').notNull().defaultNow(),
    detail: text('detail'),
    changes: jsonb('changes'),
    createdBy: varchar('created_by', { length: 100 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('tree_events_tree_idx').on(t.treeId, t.createdAt),
    index('tree_events_orchard_date_idx').on(t.orchardId, t.eventDate),
  ]
);
