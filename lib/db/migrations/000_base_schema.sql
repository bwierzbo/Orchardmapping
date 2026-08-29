-- Migration 000: base schema
--
-- Creates the core tables at their full current shape. Idempotent
-- (IF NOT EXISTS throughout), so it is a no-op on databases that
-- already have them; 001/002 then no-op their ALTERs on fresh DBs.
-- Users and their indexes live in 002.

CREATE TABLE IF NOT EXISTS orchards (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  location VARCHAR(255),
  description TEXT,
  center_lat DECIMAL(10, 8),
  center_lng DECIMAL(11, 8),
  bounds_min_lng DECIMAL(11, 8),
  bounds_min_lat DECIMAL(10, 8),
  bounds_max_lng DECIMAL(11, 8),
  bounds_max_lat DECIMAL(10, 8),
  default_zoom DECIMAL(4, 2) DEFAULT 18,
  min_zoom DECIMAL(4, 2) DEFAULT 5,
  max_zoom DECIMAL(4, 2) DEFAULT 21.5,
  tile_min_zoom INTEGER DEFAULT 5,
  tile_max_zoom INTEGER DEFAULT 23,
  ortho_pmtiles_url TEXT,
  vector_pmtiles_url TEXT,
  preview_image_url TEXT,
  ortho_api_path TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trees (
  id SERIAL PRIMARY KEY,
  tree_id VARCHAR(100) UNIQUE NOT NULL,
  orchard_id VARCHAR(50) REFERENCES orchards(id) ON DELETE CASCADE,
  name VARCHAR(255),
  variety VARCHAR(255),
  status VARCHAR(50) DEFAULT 'healthy',
  planted_date DATE,
  block_id VARCHAR(50),
  row_id VARCHAR(50),
  position INT,
  age INT,
  height DECIMAL(5, 2),
  lat DECIMAL(10, 8),
  lng DECIMAL(11, 8),
  last_pruned DATE,
  last_harvest DATE,
  yield_estimate DECIMAL(10, 2),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tree_health_logs (
  id SERIAL PRIMARY KEY,
  tree_id VARCHAR(100) REFERENCES trees(tree_id) ON DELETE CASCADE,
  status VARCHAR(50),
  notes TEXT,
  logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  logged_by VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_trees_orchard ON trees(orchard_id);
CREATE INDEX IF NOT EXISTS idx_trees_status ON trees(status);
CREATE INDEX IF NOT EXISTS idx_health_logs_tree ON tree_health_logs(tree_id);
CREATE INDEX IF NOT EXISTS idx_health_logs_date ON tree_health_logs(logged_at);
