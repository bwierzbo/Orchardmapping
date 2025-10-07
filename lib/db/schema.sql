-- Drop tables if they exist (for development)
DROP TABLE IF EXISTS tree_health_logs CASCADE;
DROP TABLE IF EXISTS trees CASCADE;
DROP TABLE IF EXISTS orchards CASCADE;

-- Create orchards table
CREATE TABLE IF NOT EXISTS orchards (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  location VARCHAR(255),
  center_lat DECIMAL(10, 8),
  center_lng DECIMAL(11, 8),
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

-- Insert sample orchard data
INSERT INTO orchards (id, name, location, center_lat, center_lng) VALUES
  ('washington', 'Washington Orchard', 'Washington State, USA', 48.113935, -123.264154),
  ('california', 'California Orchard', 'California, USA', 36.778259, -119.417931),
  ('oregon', 'Oregon Orchard', 'Oregon, USA', 44.058173, -123.092650)
ON CONFLICT (id) DO UPDATE SET
  updated_at = CURRENT_TIMESTAMP;