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

export const orchards = pgTable('orchards', {
  id: varchar('id', { length: 50 }).primaryKey(),
  name: varchar('name', { length: 200 }).notNull(),
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
    treeId: varchar('tree_id', { length: 100 }).notNull(),
    orchardId: varchar('orchard_id', { length: 50 })
      .notNull()
      .references(() => orchards.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }),
    variety: varchar('variety', { length: 100 }),
    status: varchar('status', { length: 20 }).default('healthy'),
    plantedDate: date('planted_date'),
    blockId: varchar('block_id', { length: 50 }),
    rowId: varchar('row_id', { length: 50 }),
    position: integer('position'),
    age: decimal('age', { precision: 5, scale: 1 }),
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
    uniqueIndex('trees_orchard_row_pos_uniq').on(t.orchardId, t.rowId, t.position),
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
