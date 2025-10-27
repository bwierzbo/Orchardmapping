# Orchard PMTiles Upload API

## Endpoint

`POST /api/orchards/create`

## Description

This endpoint allows authenticated users to create a new orchard by uploading a PMTiles file containing orthomosaic imagery.

## Authentication

**Required:** Yes - User must be authenticated via NextAuth session.

## Request

### Content-Type
`multipart/form-data`

### Form Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Name of the orchard (used to generate ID) |
| `location` | string | Yes | Geographic location description |
| `pmtilesFile` | File | Yes | PMTiles file (.pmtiles) containing imagery |

### Example using cURL

```bash
curl -X POST http://localhost:3000/api/orchards/create \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN" \
  -F "name=My New Orchard" \
  -F "location=Oregon, USA" \
  -F "pmtilesFile=@/path/to/orthomap.pmtiles"
```

### Example using JavaScript/Fetch

```javascript
const formData = new FormData();
formData.append('name', 'My New Orchard');
formData.append('location', 'Oregon, USA');
formData.append('pmtilesFile', pmtilesFile); // File object from input

const response = await fetch('/api/orchards/create', {
  method: 'POST',
  body: formData,
  credentials: 'include' // Include session cookie
});

const result = await response.json();
```

## Validation

The API performs the following validations:

### File Validations
- ✅ File must have `.pmtiles` extension
- ✅ File size must be under 2GB (hard limit)
- ⚠️ Warning if file is over 500MB
- ✅ Must be a valid PMTiles file with header
- ✅ Must contain geographic bounds
- ✅ Tile type must be raster (1) or vector (2)
- ⚠️ Warning if tile type is vector (optimized for raster)
- ⚠️ Warning if bounds appear to be world coordinates

### Orchard Validations
- ✅ Name is required and must contain alphanumeric characters
- ✅ Location is required
- ✅ Generated orchard ID must be unique (not already in database)

### Metadata Extraction
The API automatically extracts and validates:
- Geographic bounds (minLng, minLat, maxLng, maxLat)
- Center coordinates (calculated from bounds if not in header)
- Min and max zoom levels
- Tile type (raster vs vector)

## Response

### Success Response (201 Created)

```json
{
  "success": true,
  "orchardId": "my-new-orchard",
  "message": "Orchard \"My New Orchard\" created successfully",
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

### Error Responses

#### 401 Unauthorized
```json
{
  "error": "Unauthorized. Please sign in."
}
```

#### 400 Bad Request - Missing Fields
```json
{
  "error": "Missing required fields",
  "details": {
    "name": null,
    "location": "Location is required",
    "pmtilesFile": null
  }
}
```

#### 400 Bad Request - Invalid File Type
```json
{
  "error": "Invalid file type. Please upload a .pmtiles file."
}
```

#### 400 Bad Request - Invalid PMTiles
```json
{
  "error": "Failed to validate PMTiles: Could not read header"
}
```

#### 409 Conflict - Duplicate Orchard
```json
{
  "error": "Orchard already exists",
  "details": "An orchard with ID \"my-new-orchard\" already exists. Please use a different name."
}
```

#### 413 Payload Too Large
```json
{
  "error": "File too large",
  "details": "File size is 2500.50MB. Maximum allowed size is 2GB."
}
```

#### 500 Internal Server Error
```json
{
  "error": "Failed to create orchard",
  "details": "Detailed error message"
}
```

## What Happens When You Upload

1. **Authentication Check**: Verifies you are logged in
2. **File Validation**: Checks file type, size, and format
3. **PMTiles Validation**:
   - Reads PMTiles header
   - Validates geographic bounds
   - Extracts metadata (zoom levels, bounds, center)
   - Checks tile type (raster/vector)
4. **ID Generation**: Creates unique orchard ID from name (lowercase, hyphenated)
5. **Duplicate Check**: Ensures orchard ID doesn't already exist
6. **File Storage**: Saves to `/public/orchards/[orchard-id]/tiles/orthomap.pmtiles`
7. **Database Insert**: Adds orchard record to PostgreSQL database
8. **Config Update**: Automatically updates `/lib/orchards.ts` with new orchard configuration
9. **Response**: Returns success with metadata and any warnings

## File Storage

Uploaded files are stored at:
```
/public/orchards/[orchard-id]/tiles/orthomap.pmtiles
```

For example, an orchard named "My New Orchard" would be stored at:
```
/public/orchards/my-new-orchard/tiles/orthomap.pmtiles
```

## Database Schema

The orchard is inserted into the `orchards` table:

```sql
INSERT INTO orchards (id, name, location, center_lat, center_lng)
VALUES (orchardId, name, location, centerLat, centerLng)
```

## Config File Update

The endpoint automatically updates `/lib/orchards.ts` with the new orchard configuration:

```typescript
'my-new-orchard': {
  id: 'my-new-orchard',
  name: 'My New Orchard',
  location: 'Oregon, USA',
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
  orthoPmtilesPath: '/orchards/my-new-orchard/tiles/orthomap.pmtiles',
  pmtilesPath: '',
  previewImage: '/orchards/my-new-orchard/preview.jpg'
}
```

## Notes

- **Max Zoom Capping**: Max zoom is automatically capped at 21.5 to prevent map rendering issues
- **Temporary Files**: The API uses a temporary directory during processing and cleans up after
- **Atomic Operations**: If any step fails, the orchard is not created (database transaction safety)
- **TypeScript Config**: The orchards.ts file maintains proper TypeScript formatting after update

## Testing with Postman

1. Sign in to get session cookie
2. Create new POST request to `http://localhost:3000/api/orchards/create`
3. Set body type to `form-data`
4. Add fields:
   - `name`: Text value
   - `location`: Text value
   - `pmtilesFile`: File (select .pmtiles file)
5. Send request

## Security

- Requires valid NextAuth session
- File type validation prevents non-PMTiles uploads
- File size limits prevent DoS attacks
- Orchard ID sanitization prevents path traversal
- Database prepared statements prevent SQL injection
