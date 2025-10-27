# Tree Editing Feature - Complete Guide

## Overview

The Tree Editing feature provides a comprehensive system for managing tree data in orchards, including adding, editing, deleting, repositioning, and bulk importing trees.

## Features

### 1. Edit Mode
- Toggle edit mode with the "Enter Edit Mode" button or press `E` key
- Visual indicators: green border around map, crosshair cursor
- Edit panel displays on the left with tree placement controls

### 2. Adding Trees
- **Method**: Click on the map in edit mode
- **Required**: Row ID and Position
- **Optional**: Auto-increment position for sequential placement
- **Visual Feedback**: New trees fade in with pulse animation
- **Toast**: "Tree added at Row X, Position Y"

### 3. Editing Trees
- **Method**: Click on existing tree marker in edit mode
- **Opens**: Right-side modal with editable form
- **Editable Fields**:
  - Variety (text)
  - Status (dropdown: healthy, stressed, dead, unknown)
  - Planted Date (date picker)
  - Age (number, years)
  - Height (number, meters)
  - Last Pruned (date)
  - Last Harvest (date)
  - Yield Estimate (number, kg)
  - Notes (textarea)
- **Read-Only**: Row ID, Position, Tree ID
- **Toast**: "Tree {tree_id} updated successfully"

### 4. Deleting Trees
- **Method**: Click "Delete Tree" button in edit modal
- **Confirmation**: "Delete {tree_id}? This cannot be undone."
- **Result**: Tree removed from map and database
- **Toast**: "Tree {tree_id} deleted successfully"

### 5. Drag to Reposition
- **Method**: Click and drag tree marker in edit mode
- **Visual Feedback**:
  - Marker scales to 1.5x
  - Semi-transparent (70% opacity)
  - Enhanced shadow
- **On Drop**:
  - Blue highlight pulse animation
  - Position updated in database
- **Toast**: "Tree {tree_id} repositioned"
- **Error Recovery**: Reverts to original position if API call fails

### 6. Bulk Import
- **Access**: "Import Tree Data" button (top-right, blue)
- **File Types**: CSV or Excel (.csv, .xlsx)
- **Features**:
  - Drag-and-drop or file picker
  - Template CSV download
  - Preview first 5 rows
  - Validation with error reporting
  - Partial success handling (207 Multi-Status)
- **Toast**: "Imported X trees" or error messages

### 7. Keyboard Shortcuts
- **Escape**: Exit edit mode / Close edit modal
- **E**: Toggle edit mode (when not in modal)

### 8. Visual Indicators

#### Tree Marker Colors:
- 🟢 Green (#10b981): Healthy
- 🟡 Amber (#f59e0b): Stressed
- 🔴 Red (#ef4444): Dead
- ⚪ Gray (#6b7280): Unknown

#### Marker States:
- **Normal**: 12px diameter
- **Edit Mode**: 14px diameter
- **Hover**: 1.3x scale, tooltip with tree_id
- **Dragging**: 1.5x scale, 70% opacity
- **New Tree**: Fade-in pulse animation (2s)
- **After Edit**: Blue highlight pulse (0.6s)

## Workflow Guide

### Complete Workflow: Add → Edit → Delete

#### Step 1: Authentication
1. Visit the application homepage
2. Click "Sign In" or use the floating "+" button
3. Sign in with credentials:
   - Email: `admin` or `swierzbo@yahoo.com`
   - Password: `orchard123` or `Fynnhaven24!`

#### Step 2: Navigate to Orchard
1. From homepage, click on an orchard card
2. Map loads with orthomosaic imagery
3. Existing trees (if any) display as colored markers

#### Step 3: Enter Edit Mode
1. Click "Enter Edit Mode" button (top-right) OR press `E` key
2. **Visual Changes**:
   - Green border appears around map
   - Map cursor changes to crosshair
   - Edit panel appears on left
   - Existing trees become draggable (move cursor)
   - Banner displays: "Edit Mode Active - Click map to place trees"

#### Step 4: Add a Tree
1. In edit panel, enter:
   - **Row ID**: e.g., "1", "A", "R01"
   - **Position**: e.g., 1, 2, 3
2. Optionally check "Auto-increment position"
3. Click anywhere on the map
4. **Result**:
   - Tree marker appears with fade-in animation
   - Toast notification: "Tree added at Row X, Position Y"
   - If auto-increment enabled, position increases by 1

#### Step 5: Edit a Tree
1. Click on any existing tree marker
2. Edit modal slides in from right
3. Modify any fields (variety, status, dates, etc.)
4. Click "Save Changes"
5. **Result**:
   - Modal closes
   - Tree marker updates (color if status changed)
   - Toast: "Tree {tree_id} updated successfully"

#### Step 6: Drag to Reposition
1. In edit mode, hover over tree marker (cursor shows "move")
2. Click and hold, drag to new location
3. Release to drop
4. **Result**:
   - Tree marker shows blue highlight pulse
   - Position saved to database
   - Toast: "Tree {tree_id} repositioned"

#### Step 7: Delete a Tree
1. Click on tree marker to open edit modal
2. Scroll to "Delete Tree" button (red)
3. Click "Delete Tree"
4. Confirmation dialog appears
5. Click "Yes, Delete"
6. **Result**:
   - Tree marker disappears from map
   - Modal closes
   - Toast: "Tree {tree_id} deleted successfully"

#### Step 8: Bulk Import
1. Click "Import Tree Data" button (top-right, blue)
2. **Optional**: Click "Download Template CSV" for format example
3. Drag CSV file into upload area OR click "Browse Files"
4. Review preview table (first 5 rows shown)
5. Check for validation errors (displayed in red box if any)
6. Click "Import Data"
7. **Result**:
   - Progress spinner displays
   - Trees added/updated in database
   - Results shown: "Updated X of Y trees"
   - Errors listed if any (with row/position details)
   - Trees auto-reload on map

#### Step 9: Exit Edit Mode
1. Click "Exit Edit Mode" button OR press `Escape` key
2. **Visual Changes**:
   - Green border removed
   - Cursor returns to normal
   - Edit panel hidden
   - Trees no longer draggable

## Testing Checklist

### Authentication & Access
- [ ] Sign in successfully redirects to intended page
- [ ] Unauthenticated users cannot access edit features
- [ ] Edit Mode button only visible when authenticated
- [ ] Import button only visible when authenticated

### Edit Mode Toggle
- [ ] "Enter Edit Mode" button works
- [ ] `E` key toggles edit mode
- [ ] Visual indicators appear (border, cursor, panel)
- [ ] "Exit Edit Mode" button works
- [ ] `Escape` key exits edit mode

### Adding Trees
- [ ] Cannot add tree without row ID
- [ ] Cannot add tree without position
- [ ] Warning toast shows for missing fields
- [ ] Tree appears on map after adding
- [ ] Success toast displays with row/position
- [ ] Auto-increment works correctly
- [ ] Fade-in animation plays
- [ ] Duplicate detection works (error toast)
- [ ] Tree ID format correct: {orchard}-R##-P###

### Editing Trees
- [ ] Click tree marker opens edit modal
- [ ] All fields pre-populated with current data
- [ ] Row ID and Position are read-only
- [ ] Variety text input works
- [ ] Status dropdown has all options
- [ ] Date pickers work correctly
- [ ] Number inputs validate properly
- [ ] Notes textarea works
- [ ] Save button updates tree
- [ ] Success toast displays
- [ ] Modal closes after save
- [ ] Marker color updates if status changed
- [ ] Cancel button closes without saving

### Deleting Trees
- [ ] Delete button shows in edit modal
- [ ] Confirmation dialog appears
- [ ] Cancel button prevents deletion
- [ ] "Yes, Delete" removes tree
- [ ] Tree marker disappears immediately
- [ ] Success toast displays
- [ ] Modal closes after deletion

### Drag to Reposition
- [ ] Tree markers draggable only in edit mode
- [ ] Cursor changes to "move" on hover
- [ ] Marker scales up while dragging
- [ ] Marker becomes semi-transparent
- [ ] Tooltip hides while dragging
- [ ] Position updates on drop
- [ ] Blue highlight pulse plays
- [ ] Success toast displays
- [ ] Error reverts to original position
- [ ] Error toast displays on failure

### Bulk Import
- [ ] Import button opens modal
- [ ] Template CSV downloads correctly
- [ ] Drag-and-drop accepts CSV files
- [ ] File picker accepts CSV files
- [ ] Rejects non-CSV files
- [ ] Preview shows first 5 rows
- [ ] Required columns validated
- [ ] Date format validated (YYYY-MM-DD)
- [ ] Status values validated
- [ ] Number fields validated
- [ ] Error messages show row numbers
- [ ] Import button disabled without file
- [ ] Loading spinner shows during import
- [ ] Success message shows count
- [ ] Partial success shows warnings
- [ ] Errors listed with details
- [ ] Trees auto-reload after import
- [ ] Modal closeable after import

### Visual Feedback
- [ ] Marker colors match status
- [ ] Tooltips show on hover
- [ ] Tooltips display tree_id
- [ ] Markers larger in edit mode
- [ ] New tree animation plays
- [ ] Edit highlight animation plays
- [ ] Loading overlay blocks interaction
- [ ] Toast notifications slide in
- [ ] Toasts auto-dismiss after 3 seconds
- [ ] Toast close button works

### Keyboard Shortcuts
- [ ] Escape exits edit mode
- [ ] Escape closes edit modal
- [ ] E toggles edit mode
- [ ] Shortcuts ignored when typing in inputs

### Error Handling
- [ ] Network errors show error toast
- [ ] API errors display friendly messages
- [ ] Duplicate tree shows specific error
- [ ] Failed saves revert changes
- [ ] Failed deletes keep tree
- [ ] Failed drags revert position

### Mobile Responsiveness
- [ ] Edit panel layout adapts to mobile
- [ ] Touch events work for drag
- [ ] Buttons appropriately sized
- [ ] Modal scrollable on small screens
- [ ] Toast notifications visible

### Performance
- [ ] Map loads within 2 seconds
- [ ] Trees render without lag
- [ ] No memory leaks on cleanup
- [ ] Drag is smooth and responsive
- [ ] Bulk import handles large files

## Common Issues & Solutions

### Issue: Trees not appearing on map
**Solution**:
- Check network tab for API errors
- Verify trees have lat/lng coordinates
- Check browser console for JavaScript errors
- Refresh page to reload trees

### Issue: Cannot enter edit mode
**Solution**:
- Ensure you are signed in
- Check if another modal is open (close it first)
- Try refreshing the page

### Issue: Drag not working
**Solution**:
- Confirm you are in edit mode
- Check if tree has lat/lng coordinates
- Try clicking marker to ensure it's interactive
- Verify MapLibre GL is loaded correctly

### Issue: CSV import failing
**Solution**:
- Verify CSV has required columns: row_id, position
- Check date format is YYYY-MM-DD
- Ensure status values are: healthy, stressed, dead, or unknown
- Look at preview table for validation errors
- Try template CSV to verify format

### Issue: Toast notifications not showing
**Solution**:
- Check browser console for errors
- Verify z-index not conflicting with other elements
- Clear browser cache and refresh

### Issue: Duplicate tree error when adding
**Solution**:
- Check if tree already exists at that row/position
- Try different row or position
- Use edit mode to update existing tree instead

## API Endpoints Used

### GET /api/trees
- Fetch all trees for an orchard
- Query param: `orchard_id`

### POST /api/trees
- Create new tree
- Requires: orchard_id, row_id, position, lat, lng
- Returns: Created tree object

### GET /api/trees/[id]
- Fetch single tree by tree_id
- Returns: Tree object with all fields

### PUT /api/trees/[id]
- Update existing tree
- Body: Any editable fields
- Returns: Updated tree object

### DELETE /api/trees/[id]
- Delete tree by tree_id
- Returns: Success message

### POST /api/trees/bulk-update
- Bulk update/create trees
- Body: { orchard_id, updates: [...] }
- Returns: { updated, total, errors }

## Database Schema

```sql
CREATE TABLE trees (
  id SERIAL PRIMARY KEY,
  tree_id VARCHAR(255) UNIQUE NOT NULL,
  orchard_id VARCHAR(255) NOT NULL,
  row_id VARCHAR(255) NOT NULL,
  position INTEGER NOT NULL,
  lat DECIMAL(10, 8),
  lng DECIMAL(11, 8),
  variety VARCHAR(255),
  status VARCHAR(50),
  planted_date DATE,
  age DECIMAL(5, 2),
  height DECIMAL(5, 2),
  last_pruned DATE,
  last_harvest DATE,
  yield_estimate DECIMAL(10, 2),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(orchard_id, row_id, position)
);
```

## File Structure

```
/app/orchard/[id]/
  ├── page.tsx                    # Main orchard map page
  ├── components/
  │   └── BulkTreeImport.tsx      # CSV import component
  └── popup-styles.css            # Styles and animations

/lib/
  ├── db/
  │   ├── trees.ts                # Tree database helpers
  │   └── orchards.ts             # Orchard database helpers
  └── csv-parser.ts               # CSV parsing utilities

/components/
  └── Toast.tsx                   # Toast notification system

/api/trees/
  ├── route.ts                    # GET all, POST new
  ├── [id]/route.ts               # GET one, PUT, DELETE
  └── bulk-update/route.ts        # Bulk import

/docs/
  ├── TREE-API-DOCUMENTATION.md   # API reference
  └── TREE-EDITING-GUIDE.md       # This file
```

## Credits

This tree editing system was built using:
- Next.js 15 with App Router
- MapLibre GL for map rendering
- NextAuth.js for authentication
- Vercel Postgres for database
- Tailwind CSS for styling
- PMTiles for map tiles

---

**Last Updated**: 2025-10-16
**Version**: 1.0.0
