-- Migration: Add tile and configuration columns to orchards table
-- This enables storing full orchard configuration in the database
-- instead of the static lib/orchards.ts file

-- Add description
ALTER TABLE orchards ADD COLUMN IF NOT EXISTS description TEXT;

-- Add bounds columns
ALTER TABLE orchards ADD COLUMN IF NOT EXISTS bounds_min_lng DECIMAL(11, 8);
ALTER TABLE orchards ADD COLUMN IF NOT EXISTS bounds_min_lat DECIMAL(10, 8);
ALTER TABLE orchards ADD COLUMN IF NOT EXISTS bounds_max_lng DECIMAL(11, 8);
ALTER TABLE orchards ADD COLUMN IF NOT EXISTS bounds_max_lat DECIMAL(10, 8);

-- Add zoom level columns
ALTER TABLE orchards ADD COLUMN IF NOT EXISTS default_zoom DECIMAL(4, 2) DEFAULT 18;
ALTER TABLE orchards ADD COLUMN IF NOT EXISTS min_zoom DECIMAL(4, 2) DEFAULT 5;
ALTER TABLE orchards ADD COLUMN IF NOT EXISTS max_zoom DECIMAL(4, 2) DEFAULT 21.5;
ALTER TABLE orchards ADD COLUMN IF NOT EXISTS tile_min_zoom INTEGER DEFAULT 5;
ALTER TABLE orchards ADD COLUMN IF NOT EXISTS tile_max_zoom INTEGER DEFAULT 23;

-- Add tile URL columns (for Vercel Blob storage)
ALTER TABLE orchards ADD COLUMN IF NOT EXISTS ortho_pmtiles_url TEXT;
ALTER TABLE orchards ADD COLUMN IF NOT EXISTS vector_pmtiles_url TEXT;
ALTER TABLE orchards ADD COLUMN IF NOT EXISTS preview_image_url TEXT;

-- Legacy: API tile path for orchards using the tile API instead of PMTiles
ALTER TABLE orchards ADD COLUMN IF NOT EXISTS ortho_api_path TEXT;

-- Create index on id for faster lookups (if not exists)
CREATE INDEX IF NOT EXISTS idx_orchards_id ON orchards(id);
