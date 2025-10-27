# PMTiles Upload API - Implementation Summary

## Overview

A complete API endpoint has been created to handle PMTiles file uploads and automatic orchard creation with full validation, metadata extraction, and configuration management.

## Implementation Details

### API Endpoint
**File:** `/app/api/orchards/create/route.ts`

**Method:** `POST`

**Authentication:** Required (NextAuth session)

**Content-Type:** `multipart/form-data`

## Features Implemented

### ✅ 1. Multipart Form Data Handler
- Uses Next.js built-in FormData API
- Accepts three fields: `name`, `location`, `pmtilesFile`
- Validates all required fields are present

### ✅ 2. PMTiles Validation
Comprehensive validation includes:
- File extension check (must be `.pmtiles`)
- File size validation (< 500MB warning, < 2GB hard limit)
- Valid PMTiles header verification
- Geographic bounds validation
- Tile type validation (raster/vector)
- World bounds detection (warns if incorrect georeferencing)

### ✅ 3. Metadata Extraction
Automatically extracts from PMTiles header:
- Geographic bounds (minLng, minLat, maxLng, maxLat)
- Center coordinates (calculated or from header)
- Min zoom level
- Max zoom level (capped at 21.5 to prevent map issues)
- Tile type (1 = raster, 2 = vector)

### ✅ 4. File Storage
- Saves to: `/public/orchards/[orchard-id]/tiles/orthomap.pmtiles`
- Creates directory structure automatically
- Uses temporary file during validation
- Atomic operations with cleanup on failure

### ✅ 5. Database Integration
Inserts orchard record into PostgreSQL:
```sql
INSERT INTO orchards (id, name, location, center_lat, center_lng)
VALUES (orchardId, name, location, centerLat, centerLng)
```

Validates orchard ID is unique before insertion.

### ✅ 6. Orchards Configuration Update
Automatically updates `/lib/orchards.ts`:
- Reads existing configuration
- Generates new orchard config with all metadata
- Maintains TypeScript formatting
- Adds to orchards object

Example generated config:
```typescript
'my-orchard': {
  id: 'my-orchard',
  name: 'My Orchard',
  location: 'Washington, USA',
  description: 'Orchard orthomosaic imagery',
  center: [-123.16743, 48.14192],
  bounds: {
    minLng: -123.16823,
    minLat: 48.14138,
    maxLng: -123.16663,
    maxLat: 48.14245
  },
  defaultZoom: 17,
  minZoom: 5,
  maxZoom: 21.5,
  tileMinZoom: 5,
  tileMaxZoom: 21.5,
  orthoPath: '',
  orthoPmtilesPath: '/orchards/my-orchard/tiles/orthomap.pmtiles',
  pmtilesPath: '',
  previewImage: '/orchards/my-orchard/preview.jpg'
}
```

### ✅ 7. ID Generation
- Converts name to lowercase
- Replaces non-alphanumeric characters with hyphens
- Removes leading/trailing hyphens
- Example: "My New Orchard" → "my-new-orchard"

### ✅ 8. Error Handling
Comprehensive error responses:
- 401: Unauthorized (not signed in)
- 400: Invalid input (missing fields, invalid file type, invalid PMTiles)
- 409: Conflict (orchard ID already exists)
- 413: Payload too large (> 2GB)
- 500: Internal server error

### ✅ 9. Warnings System
Non-fatal issues are returned as warnings:
- Large file size (> 500MB)
- Vector tiles detected (optimized for raster)
- World bounds detected (potential georeferencing issue)
- Max zoom capped at 21.5

## Testing Tools

### 1. Interactive Web Interface
**URL:** `http://localhost:3000/test-upload.html`

Features:
- Beautiful UI with drag-and-drop file selection
- Real-time file size display
- Progress indication
- Success/error messaging with full details
- Direct link to view created orchard

### 2. Command-Line Test Script
**File:** `/scripts/test-upload-orchard.sh`

Usage:
```bash
./scripts/test-upload-orchard.sh /path/to/orthomap.pmtiles
```

Features:
- File size check
- Cookie-based authentication
- Customizable orchard details
- Colored output
- JSON response formatting

### 3. API Documentation
**File:** `/docs/API-ORCHARD-UPLOAD.md`

Complete documentation including:
- Endpoint specifications
- Request/response formats
- Validation rules
- Error codes and messages
- cURL examples
- JavaScript/Fetch examples
- Postman testing instructions

## Usage Examples

### Using Fetch API (Browser)
```javascript
const formData = new FormData();
formData.append('name', 'My Orchard');
formData.append('location', 'Oregon, USA');
formData.append('pmtilesFile', fileInput.files[0]);

const response = await fetch('/api/orchards/create', {
  method: 'POST',
  body: formData,
  credentials: 'include'
});

const result = await response.json();
if (response.ok) {
  console.log('Success:', result.orchardId);
  window.location.href = `/orchard/${result.orchardId}`;
}
```

### Using cURL
```bash
curl -X POST http://localhost:3000/api/orchards/create \
  -H "Cookie: next-auth.session-token=YOUR_TOKEN" \
  -F "name=Test Orchard" \
  -F "location=Washington, USA" \
  -F "pmtilesFile=@orthomap.pmtiles"
```

## Success Response Example

```json
{
  "success": true,
  "orchardId": "test-orchard",
  "message": "Orchard \"Test Orchard\" created successfully",
  "warnings": [
    "Large file detected (650.25MB). Upload may take some time."
  ],
  "metadata": {
    "bounds": {
      "minLng": -123.16823,
      "minLat": 48.14138,
      "maxLng": -123.16663,
      "maxLat": 48.14245
    },
    "center": {
      "lng": -123.16743,
      "lat": 48.14192
    },
    "minZoom": 5,
    "maxZoom": 21.5,
    "tileType": "raster",
    "fileSizeMB": "650.25"
  }
}
```

## Security Features

1. **Authentication Required**: All requests must have valid NextAuth session
2. **File Type Validation**: Only `.pmtiles` files accepted
3. **File Size Limits**: Hard limit at 2GB to prevent DoS
4. **ID Sanitization**: Prevents path traversal attacks
5. **SQL Injection Protection**: Uses parameterized queries
6. **Unique ID Check**: Prevents duplicate orchards
7. **Temporary File Cleanup**: No file remnants after processing

## What Happens on Upload

1. ✅ **Authentication check** - Verify user is signed in
2. ✅ **Parse form data** - Extract name, location, and file
3. ✅ **Validate inputs** - Check all required fields present
4. ✅ **Generate orchard ID** - Create unique ID from name
5. ✅ **Check for duplicates** - Query database for existing ID
6. ✅ **Validate file** - Check extension and size
7. ✅ **Write temp file** - Save for validation
8. ✅ **Validate PMTiles** - Read header and extract metadata
9. ✅ **Create directories** - Build `/public/orchards/[id]/tiles/`
10. ✅ **Move file** - Rename temp to final location
11. ✅ **Insert database** - Add orchard record
12. ✅ **Update config** - Modify `orchards.ts`
13. ✅ **Return response** - Send success with metadata

## File Structure Created

```
/public/orchards/
  └── [orchard-id]/
      └── tiles/
          └── orthomap.pmtiles
```

## Database Record Created

```sql
orchards table:
- id: 'test-orchard'
- name: 'Test Orchard'
- location: 'Washington, USA'
- center_lat: 48.14192
- center_lng: -123.16743
- created_at: [timestamp]
- updated_at: [timestamp]
```

## Next Steps

To test the API:

1. **Sign in** to http://localhost:3000 with admin credentials
2. **Visit** http://localhost:3000/test-upload.html
3. **Fill out** the form with orchard details
4. **Select** a PMTiles file
5. **Click** "Upload Orchard"
6. **View** the newly created orchard

Or use the command-line script:
```bash
./scripts/test-upload-orchard.sh /path/to/orthomap.pmtiles
```

## Implementation Files

| File | Purpose |
|------|---------|
| `/app/api/orchards/create/route.ts` | Main API endpoint |
| `/docs/API-ORCHARD-UPLOAD.md` | Complete API documentation |
| `/docs/UPLOAD-API-SUMMARY.md` | This summary document |
| `/public/test-upload.html` | Interactive test interface |
| `/scripts/test-upload-orchard.sh` | CLI test script |

## Notes

- **Max zoom capping**: All max zoom levels are automatically capped at 21.5 to prevent map rendering issues
- **Temporary files**: Uses `/tmp` directory for validation, automatically cleaned up
- **Atomic operations**: If any step fails, the entire operation rolls back
- **TypeScript safe**: Maintains proper formatting when updating `orchards.ts`
- **Production ready**: Includes comprehensive error handling and validation

## Support

For issues or questions:
- Check `/docs/API-ORCHARD-UPLOAD.md` for detailed documentation
- Review error messages in API responses
- Check server logs for detailed error information
- Test with the interactive UI at `/test-upload.html`
