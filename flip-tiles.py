#!/usr/bin/env python3
import sqlite3
import shutil

# Copy original file
shutil.copy('public/orchards/washington/tiles/orthomap.mbtiles', 'public/orchards/washington/tiles/orthomap-xyz.mbtiles')

# Connect to the copied database
conn = sqlite3.connect('public/orchards/washington/tiles/orthomap-xyz.mbtiles')
cursor = conn.cursor()

# Get all tiles
cursor.execute('SELECT zoom_level, tile_column, tile_row, tile_data FROM tiles')
tiles = cursor.fetchall()

print(f'Flipping {len(tiles)} tiles from TMS to XYZ...')

# Delete all tiles
cursor.execute('DELETE FROM tiles')

# Re-insert with flipped Y coordinates
for zoom, x, y_tms, data in tiles:
    y_xyz = (2 ** zoom - 1) - y_tms
    cursor.execute('INSERT INTO tiles (zoom_level, tile_column, tile_row, tile_data) VALUES (?, ?, ?, ?)',
                   (zoom, x, y_xyz, data))

conn.commit()
conn.close()

print('Done! Tiles converted from TMS to XYZ')
print('New file: public/orchards/washington/tiles/orthomap-xyz.mbtiles')
