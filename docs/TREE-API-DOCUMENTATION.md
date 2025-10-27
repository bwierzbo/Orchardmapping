# Tree Management API Documentation

## Overview

Complete REST API for managing trees in orchards with database helper functions and authentication protection.

## Files Created

### Database Helper Functions
**File:** `/lib/db/trees.ts` (400+ lines)

### API Routes
1. `/app/api/trees/route.ts` - GET & POST trees
2. `/app/api/trees/[id]/route.ts` - GET, PUT, DELETE single tree
3. `/app/api/trees/bulk-update/route.ts` - Bulk update trees

---

## Database Helper Functions

### `insertTree(treeData)`

**Purpose:** Insert a new tree with auto-generated tree_id

**Parameters:**
```typescript
interface TreeInsertData {
  orchard_id: string;      // Required
  row_id: string;          // Required
  position: number;        // Required
  lat?: number;
  lng?: number;
  variety?: string;
  status?: string;
  planted_date?: Date;
  age?: number;
  height?: number;
  last_pruned?: Date;
  last_harvest?: Date;
  yield_estimate?: number;
  notes?: string;
}
```

**Returns:** `Tree` object

**Auto-generates tree_id:**
- Format: `[ORCHARD_ID]-R[ROW]-P[POSITION]`
- Example: `washington-R01-P001`
- Row and position are zero-padded

**Features:**
- ✅ Validates required fields
- ✅ Checks for duplicate row/position
- ✅ Auto-generates tree_id
- ✅ SQL injection safe
- ✅ Returns full tree object

**Example:**
```typescript
const tree = await insertTree({
  orchard_id: 'washington',
  row_id: '1',
  position: 5,
  lat: 48.14192,
  lng: -123.16743,
  variety: 'Honeycrisp',
  status: 'healthy'
});
// tree_id: 'washington-R01-P005'
```

### `updateTree(tree_id, updates)`

**Purpose:** Update existing tree fields

**Parameters:**
- `tree_id: string` - The tree ID to update
- `updates: Partial<Tree>` - Fields to update

**Updatable Fields:**
- variety, status, planted_date
- age, height, lat, lng
- last_pruned, last_harvest
- yield_estimate, notes

**Protected Fields** (cannot update):
- id, tree_id, orchard_id
- row_id, position
- created_at, updated_at

**Returns:** Updated `Tree` object or `null`

**Example:**
```typescript
const updated = await updateTree('washington-R01-P005', {
  variety: 'Fuji',
  status: 'healthy',
  yield_estimate: 175.5,
  notes: 'Excellent producer'
});
```

### `deleteTree(tree_id)`

**Purpose:** Delete a tree from database

**Parameters:** `tree_id: string`

**Returns:** `boolean` (success/failure)

**Example:**
```typescript
const deleted = await deleteTree('washington-R01-P005');
if (deleted) {
  console.log('Tree deleted successfully');
}
```

### `getTreesByOrchard(orchard_id)`

**Purpose:** Get all trees for an orchard

**Parameters:** `orchard_id: string`

**Returns:** `Tree[]` array

**Features:**
- Ordered by row_id and position
- Returns empty array on error

**Example:**
```typescript
const trees = await getTreesByOrchard('washington');
console.log(`Found ${trees.length} trees`);
```

### `checkDuplicateRowPosition(orchard_id, row_id, position)`

**Purpose:** Check if tree already exists at location

**Parameters:**
- `orchard_id: string`
- `row_id: string`
- `position: number`

**Returns:** `boolean` (true if duplicate exists)

**Example:**
```typescript
const isDuplicate = await checkDuplicateRowPosition('washington', '1', 5);
if (isDuplicate) {
  console.log('Tree already exists at this location');
}
```

### `getTreeByRowPosition(orchard_id, row_id, position)`

**Purpose:** Find tree by orchard, row, and position

**Parameters:**
- `orchard_id: string`
- `row_id: string`
- `position: number`

**Returns:** `Tree` object or `null`

**Example:**
```typescript
const tree = await getTreeByRowPosition('washington', '1', 5);
if (tree) {
  console.log(`Found: ${tree.tree_id}`);
}
```

### `getTreeById(tree_id)`

**Purpose:** Get single tree by tree_id

**Parameters:** `tree_id: string`

**Returns:** `Tree` object or `null`

**Example:**
```typescript
const tree = await getTreeById('washington-R01-P005');
```

### `getTreesCount(orchard_id)`

**Purpose:** Count total trees in orchard

**Parameters:** `orchard_id: string`

**Returns:** `number`

**Example:**
```typescript
const count = await getTreesCount('washington');
console.log(`Orchard has ${count} trees`);
```

### `bulkUpdateTrees(orchard_id, updates)`

**Purpose:** Update multiple trees by row/position

**Parameters:**
```typescript
{
  orchard_id: string,
  updates: Array<{
    row_id: string;
    position: number;
    [field]: any;  // Any updatable fields
  }>
}
```

**Returns:**
```typescript
{
  updated: number;
  errors: Array<{
    row_id: string;
    position: number;
    error: string;
  }>;
}
```

**Example:**
```typescript
const result = await bulkUpdateTrees('washington', [
  { row_id: '1', position: 1, variety: 'Fuji', status: 'healthy' },
  { row_id: '1', position: 2, variety: 'Gala', status: 'sick' }
]);
console.log(`Updated ${result.updated}, ${result.errors.length} errors`);
```

---

## API Endpoints

### 1. GET /api/trees?orchard_id={id}

**Purpose:** Fetch all trees for an orchard

**Authentication:** Not required

**Query Parameters:**
- `orchard_id` (required) - The orchard ID

**Response:**
```json
{
  "success": true,
  "count": 11,
  "trees": [
    {
      "id": 1,
      "tree_id": "washington-R01-P001",
      "orchard_id": "washington",
      "variety": "Honeycrisp",
      "status": "healthy",
      "row_id": "1",
      "position": 1,
      "lat": 48.11394,
      "lng": -123.26415,
      "planted_date": "2020-03-15",
      "age": 4,
      "height": 3.5,
      "yield_estimate": 150.5,
      "notes": "Good producer",
      "created_at": "2024-10-02T23:38:18.751Z",
      "updated_at": "2024-10-02T23:38:18.751Z"
    }
  ]
}
```

**Errors:**
- `400`: Missing orchard_id parameter
- `500`: Server error

**Example cURL:**
```bash
curl "http://localhost:3000/api/trees?orchard_id=washington"
```

---

### 2. POST /api/trees

**Purpose:** Create a new tree

**Authentication:** ✅ Required

**Request Body:**
```json
{
  "orchard_id": "washington",
  "row_id": "1",
  "position": 10,
  "lat": 48.14192,
  "lng": -123.16743,
  "variety": "Fuji",
  "status": "healthy",
  "planted_date": "2024-01-15",
  "age": 1,
  "height": 2.5,
  "yield_estimate": 0,
  "notes": "Newly planted"
}
```

**Required Fields:**
- `orchard_id`
- `row_id`
- `position`

**Optional Fields:**
- lat, lng, variety, status
- planted_date, age, height
- last_pruned, last_harvest
- yield_estimate, notes

**Success Response (201):**
```json
{
  "success": true,
  "message": "Tree created successfully",
  "tree": {
    "tree_id": "washington-R01-P010",
    "orchard_id": "washington",
    "row_id": "1",
    "position": 10,
    ...
  }
}
```

**Errors:**
- `400`: Missing required fields or invalid position
- `401`: Unauthorized (not signed in)
- `409`: Duplicate row/position combination
- `500`: Server error

**Example cURL:**
```bash
curl -X POST http://localhost:3000/api/trees \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=YOUR_TOKEN" \
  -d '{
    "orchard_id": "washington",
    "row_id": "1",
    "position": 10,
    "variety": "Fuji",
    "status": "healthy"
  }'
```

---

### 3. GET /api/trees/[id]

**Purpose:** Fetch a single tree by tree_id

**Authentication:** Not required

**URL Parameter:**
- `id` - The tree_id (e.g., "washington-R01-P001")

**Success Response:**
```json
{
  "success": true,
  "tree": {
    "id": 1,
    "tree_id": "washington-R01-P001",
    "orchard_id": "washington",
    "variety": "Honeycrisp",
    ...
  }
}
```

**Errors:**
- `400`: Missing tree_id
- `404`: Tree not found
- `500`: Server error

**Example cURL:**
```bash
curl "http://localhost:3000/api/trees/washington-R01-P001"
```

---

### 4. PUT /api/trees/[id]

**Purpose:** Update a tree

**Authentication:** ✅ Required

**URL Parameter:**
- `id` - The tree_id

**Request Body:**
```json
{
  "variety": "Gala",
  "status": "stressed",
  "yield_estimate": 120.5,
  "notes": "Needs water"
}
```

**Fields You Can Update:**
- variety, status, name
- planted_date, age, height
- lat, lng (coordinates)
- last_pruned, last_harvest
- yield_estimate, notes

**Fields You CANNOT Update:**
- id, tree_id
- orchard_id, row_id, position
- created_at, updated_at

**Success Response:**
```json
{
  "success": true,
  "message": "Tree updated successfully",
  "tree": {
    "tree_id": "washington-R01-P001",
    "variety": "Gala",
    "status": "stressed",
    ...
  }
}
```

**Errors:**
- `400`: No valid fields to update
- `401`: Unauthorized
- `404`: Tree not found
- `500`: Server error

**Example cURL:**
```bash
curl -X PUT http://localhost:3000/api/trees/washington-R01-P001 \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=YOUR_TOKEN" \
  -d '{
    "variety": "Gala",
    "status": "healthy",
    "yield_estimate": 150.0
  }'
```

---

### 5. DELETE /api/trees/[id]

**Purpose:** Delete a tree

**Authentication:** ✅ Required

**URL Parameter:**
- `id` - The tree_id

**Success Response:**
```json
{
  "success": true,
  "message": "Tree deleted successfully"
}
```

**Errors:**
- `401`: Unauthorized
- `404`: Tree not found or already deleted
- `500`: Server error

**Example cURL:**
```bash
curl -X DELETE http://localhost:3000/api/trees/washington-R01-P001 \
  -H "Cookie: next-auth.session-token=YOUR_TOKEN"
```

---

### 6. POST /api/trees/bulk-update

**Purpose:** Bulk update multiple trees from CSV or batch operations

**Authentication:** ✅ Required

**Request Body:**
```json
{
  "orchard_id": "washington",
  "updates": [
    {
      "row_id": "1",
      "position": 1,
      "variety": "Fuji",
      "status": "healthy",
      "yield_estimate": 160.0
    },
    {
      "row_id": "1",
      "position": 2,
      "variety": "Gala",
      "status": "stressed",
      "notes": "Needs attention"
    },
    {
      "row_id": "2",
      "position": 1,
      "variety": "Honeycrisp",
      "yield_estimate": 180.0
    }
  ]
}
```

**Required Fields:**
- `orchard_id`
- `updates` - Array of update objects

**Each Update Object Must Have:**
- `row_id`
- `position`
- Any other fields to update

**Success Response (200 or 207):**
```json
{
  "success": true,
  "message": "Successfully updated 3 trees",
  "updated": 3,
  "total": 3,
  "errors": []
}
```

**Partial Success (207 Multi-Status):**
```json
{
  "success": true,
  "message": "Updated 2 trees with 1 errors",
  "updated": 2,
  "total": 3,
  "errors": [
    {
      "row_id": "3",
      "position": 1,
      "error": "Tree not found at row 3, position 1"
    }
  ]
}
```

**All Failed (400):**
```json
{
  "success": false,
  "message": "All updates failed",
  "updated": 0,
  "total": 3,
  "errors": [...]
}
```

**Errors:**
- `400`: Missing fields or invalid format
- `401`: Unauthorized
- `500`: Server error

**Example cURL:**
```bash
curl -X POST http://localhost:3000/api/trees/bulk-update \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=YOUR_TOKEN" \
  -d '{
    "orchard_id": "washington",
    "updates": [
      {"row_id": "1", "position": 1, "variety": "Fuji"},
      {"row_id": "1", "position": 2, "variety": "Gala"}
    ]
  }'
```

---

## TypeScript Interfaces

### Tree Interface
```typescript
interface Tree {
  id: number;                  // Auto-increment primary key
  tree_id: string;             // Unique identifier (auto-generated)
  orchard_id: string;          // Foreign key to orchards
  name?: string;
  variety?: string;
  status?: string;             // Default: 'healthy'
  planted_date?: Date;
  block_id?: string;
  row_id?: string;
  position?: number;
  age?: number;
  height?: number;             // Decimal(5,2)
  lat?: number;                // Decimal(10,8)
  lng?: number;                // Decimal(11,8)
  last_pruned?: Date;
  last_harvest?: Date;
  yield_estimate?: number;     // Decimal(10,2)
  notes?: string;
  created_at?: Date;           // Auto-generated
  updated_at?: Date;           // Auto-updated
}
```

---

## Authentication

### Required Endpoints
- ✅ POST /api/trees
- ✅ PUT /api/trees/[id]
- ✅ DELETE /api/trees/[id]
- ✅ POST /api/trees/bulk-update

### Not Required
- GET /api/trees
- GET /api/trees/[id]

### How to Authenticate

**Option 1: Browser (Session Cookie)**
```javascript
// Automatic if signed in via web interface
await fetch('/api/trees', {
  method: 'POST',
  credentials: 'include',  // Include cookies
  body: JSON.stringify(data)
});
```

**Option 2: cURL (Session Token)**
```bash
# Get token from browser DevTools > Application > Cookies
curl -X POST http://localhost:3000/api/trees \
  -H "Cookie: next-auth.session-token=YOUR_TOKEN_HERE" \
  -d '{...}'
```

---

## Usage Examples

### JavaScript/TypeScript

```typescript
// Import types
import type { Tree, TreeInsertData } from '@/lib/db/trees';

// Fetch all trees for an orchard
const response = await fetch('/api/trees?orchard_id=washington');
const data = await response.json();
console.log(`Found ${data.count} trees`);

// Create a new tree
const newTree: TreeInsertData = {
  orchard_id: 'washington',
  row_id: '3',
  position: 5,
  variety: 'Honeycrisp',
  status: 'healthy'
};

const createResponse = await fetch('/api/trees', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify(newTree)
});

const result = await createResponse.json();
console.log(`Created tree: ${result.tree.tree_id}`);

// Update a tree
const updateResponse = await fetch('/api/trees/washington-R03-P005', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    variety: 'Fuji',
    status: 'stressed',
    notes: 'Needs water'
  })
});

// Delete a tree
const deleteResponse = await fetch('/api/trees/washington-R03-P005', {
  method: 'DELETE',
  credentials: 'include'
});

// Bulk update from CSV
const bulkUpdates = [
  { row_id: '1', position: 1, variety: 'Fuji', yield_estimate: 160 },
  { row_id: '1', position: 2, variety: 'Gala', yield_estimate: 140 },
  { row_id: '2', position: 1, variety: 'Honeycrisp', yield_estimate: 180 }
];

const bulkResponse = await fetch('/api/trees/bulk-update', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    orchard_id: 'washington',
    updates: bulkUpdates
  })
});

const bulkResult = await bulkResponse.json();
console.log(`Updated ${bulkResult.updated} trees`);
if (bulkResult.errors.length > 0) {
  console.error('Errors:', bulkResult.errors);
}
```

---

## Error Handling

All endpoints return consistent error format:

```json
{
  "error": "Error message",
  "details": "Detailed explanation (optional)"
}
```

**Common HTTP Status Codes:**
- `200`: Success
- `201`: Created
- `207`: Multi-Status (partial success in bulk operations)
- `400`: Bad Request (missing/invalid parameters)
- `401`: Unauthorized (authentication required)
- `404`: Not Found
- `409`: Conflict (duplicate entry)
- `500`: Internal Server Error

---

## Database Schema

Trees table structure:

```sql
CREATE TABLE trees (
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
```

**Indexes:**
- `idx_trees_orchard` on `orchard_id`
- `idx_trees_status` on `status`
- `idx_trees_location` on `(lat, lng)`

---

## Testing

All endpoints are live and ready to test at:
- **Base URL:** http://localhost:3000

**Sign in first:**
- URL: http://localhost:3000/login
- Username: `swierzbo`
- Password: `Fynnhaven24!`

**Test GET (no auth needed):**
```bash
curl "http://localhost:3000/api/trees?orchard_id=washington"
```

**Test POST (auth required):**
```bash
# Get session token from browser first
curl -X POST http://localhost:3000/api/trees \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=YOUR_TOKEN" \
  -d '{"orchard_id":"washington","row_id":"10","position":1,"variety":"Test"}'
```

---

## Summary

✅ **9 database helper functions** created in `/lib/db/trees.ts`
✅ **3 API route files** with full CRUD operations
✅ **Authentication protection** on write operations
✅ **Auto-generated tree IDs** (orchard-R##-P###)
✅ **Bulk update support** for CSV imports
✅ **Duplicate prevention** on row/position
✅ **TypeScript types** throughout
✅ **SQL injection safe** (parameterized queries)
✅ **Error handling** with detailed messages
✅ **Comprehensive documentation**

**All systems operational!** 🎉
