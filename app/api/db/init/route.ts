import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

// POST /api/db/init - Initialize database schema
export async function POST(request: NextRequest) {
  try {
    // Check for admin key in development
    const authHeader = request.headers.get('authorization');
    if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.ADMIN_KEY}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Create tables
    await sql`
      CREATE TABLE IF NOT EXISTS orchards (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        location VARCHAR(255),
        center_lat DECIMAL(10, 8),
        center_lng DECIMAL(11, 8),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    await sql`
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
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS tree_health_logs (
        id SERIAL PRIMARY KEY,
        tree_id VARCHAR(100) REFERENCES trees(tree_id) ON DELETE CASCADE,
        status VARCHAR(50),
        notes TEXT,
        logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        logged_by VARCHAR(255)
      )
    `;

    // Create indexes
    await sql`CREATE INDEX IF NOT EXISTS idx_trees_orchard ON trees(orchard_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_trees_status ON trees(status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_trees_location ON trees(lat, lng)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_health_logs_tree ON tree_health_logs(tree_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_health_logs_date ON tree_health_logs(logged_at)`;

    // Insert sample orchard data
    await sql`
      INSERT INTO orchards (id, name, location, center_lat, center_lng) VALUES
        ('washington', 'Washington Orchard', 'Washington State, USA', 48.113935, -123.264154),
        ('california', 'California Orchard', 'California, USA', 36.778259, -119.417931),
        ('oregon', 'Oregon Orchard', 'Oregon, USA', 44.058173, -123.092650)
      ON CONFLICT (id) DO UPDATE SET
        updated_at = CURRENT_TIMESTAMP
    `;

    return NextResponse.json({
      success: true,
      message: 'Database initialized successfully'
    });
  } catch (error) {
    console.error('Error initializing database:', error);
    return NextResponse.json(
      { error: 'Failed to initialize database', details: error },
      { status: 500 }
    );
  }
}