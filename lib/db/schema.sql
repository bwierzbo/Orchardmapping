-- Drop tables if they exist (for development)
DROP TABLE IF EXISTS tree_health_logs CASCADE;
DROP TABLE IF EXISTS trees CASCADE;
DROP TABLE IF EXISTS orchards CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Create users table for authentication
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  role VARCHAR(50) DEFAULT 'viewer' CHECK (role IN ('admin', 'operator', 'viewer')),
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for email lookups
CREATE INDEX idx_users_email ON users(email);

-- Create orchards table
CREATE TABLE IF NOT EXISTS orchards (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  location VARCHAR(255),
  description TEXT,
  center_lat DECIMAL(10, 8),
  center_lng DECIMAL(11, 8),
  -- Geographic bounds
  bounds_min_lng DECIMAL(11, 8),
  bounds_min_lat DECIMAL(10, 8),
  bounds_max_lng DECIMAL(11, 8),
  bounds_max_lat DECIMAL(10, 8),
  -- Zoom levels
  default_zoom DECIMAL(4, 2) DEFAULT 18,
  min_zoom DECIMAL(4, 2) DEFAULT 5,
  max_zoom DECIMAL(4, 2) DEFAULT 21.5,
  tile_min_zoom INTEGER DEFAULT 5,
  tile_max_zoom INTEGER DEFAULT 23,
  -- Tile URLs (Vercel Blob storage)
  ortho_pmtiles_url TEXT,
  vector_pmtiles_url TEXT,
  preview_image_url TEXT,
  -- Legacy: API tile path for orchards using tile API instead of PMTiles
  ortho_api_path TEXT,
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create trees table
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

-- Create tree health logs table for tracking changes over time
CREATE TABLE IF NOT EXISTS tree_health_logs (
  id SERIAL PRIMARY KEY,
  tree_id VARCHAR(100) REFERENCES trees(tree_id) ON DELETE CASCADE,
  status VARCHAR(50),
  notes TEXT,
  logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  logged_by VARCHAR(255)
);

-- Create indexes for better performance
CREATE INDEX idx_trees_orchard ON trees(orchard_id);
CREATE INDEX idx_trees_status ON trees(status);
CREATE INDEX idx_trees_location ON trees(lat, lng);
CREATE INDEX idx_health_logs_tree ON tree_health_logs(tree_id);
CREATE INDEX idx_health_logs_date ON tree_health_logs(logged_at);

-- Note: Orchard data is now managed through the migration scripts
-- and created via the /api/orchards/create endpoint.
-- Sample data has been removed to avoid orchards without tile configuration.