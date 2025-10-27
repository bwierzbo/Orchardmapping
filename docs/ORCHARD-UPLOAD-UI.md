# Orchard Upload UI - User Guide

## Overview

The Orchard Upload UI provides a user-friendly web interface for creating new orchards by uploading PMTiles files containing orthomosaic imagery.

## Accessing the Form

### From Homepage
1. Visit http://localhost:3000
2. Scroll to the bottom of the orchard list
3. Click the **"Add New Orchard"** card with the plus icon

### Direct URL
Visit: **http://localhost:3000/orchards/new**

**Note:** You must be signed in to access this page. If not authenticated, you'll be redirected to the login page.

## Form Features

### 🎨 Design
- **Gradient Background**: Matches the app's main design (green-to-blue gradient)
- **Card-Based Layout**: Clean, centered form with shadow effects
- **Responsive**: Works on desktop, tablet, and mobile devices
- **Consistent Styling**: Uses the same Tailwind design system as the rest of the app

### 📝 Form Fields

#### 1. Orchard Name (Required)
- **Purpose**: Unique identifier for your orchard
- **Format**: Any text (will be converted to lowercase, hyphenated ID)
- **Example**: "Sunny Valley Apple Orchard" → `sunny-valley-apple-orchard`
- **Validation**: Cannot be empty, must be unique

#### 2. Location Description (Required)
- **Purpose**: Geographic description of the orchard
- **Format**: Free text
- **Example**: "Washington State, USA"
- **Validation**: Cannot be empty

#### 3. PMTiles File Upload (Required)
- **Purpose**: Orthomosaic imagery tiles
- **Format**: `.pmtiles` file only
- **Methods**: Drag-and-drop OR click to browse
- **File Size**:
  - Recommended: Under 500MB for faster uploads
  - Maximum: 2GB (hard limit)
  - Warning displayed for files over 500MB

### 🎯 Upload Methods

#### Method 1: Drag and Drop
1. Drag your `.pmtiles` file from your file system
2. Drop it onto the upload zone (turns green when ready)
3. File name and size will appear
4. Click "Remove file" if you need to change it

#### Method 2: File Browser
1. Click anywhere in the upload zone
2. System file picker opens
3. Select your `.pmtiles` file
4. File name and size will appear

### 📊 Visual States

#### 1. Initial State
- Empty form with informational blue box
- All fields ready for input
- Upload zone shows cloud icon with instructions

#### 2. File Selected
- Upload zone shows green checkmark
- Displays file name and size
- "Remove file" button available

#### 3. Drag Over
- Upload zone turns green with green border
- Visual feedback that drop will be accepted

#### 4. Loading State
- Form fields disabled
- Blue progress bar with percentage
- Animated spinner
- "Uploading and processing..." message
- "Create Orchard" button shows "Creating Orchard..."

#### 5. Success State
- Green checkmark icon
- "Orchard Created Successfully!" message
- Automatic redirect to new orchard in 2 seconds
- Loading spinner during redirect

#### 6. Error State
- Red error box with warning icon
- Clear error message
- Form remains editable
- User can fix issues and retry

### ⚠️ Error Messages

Common errors and solutions:

| Error | Cause | Solution |
|-------|-------|----------|
| "Orchard name is required" | Empty name field | Enter an orchard name |
| "Location is required" | Empty location field | Enter a location description |
| "PMTiles file is required" | No file selected | Upload a .pmtiles file |
| "Please upload a .pmtiles file" | Wrong file type | Only .pmtiles files accepted |
| "Orchard already exists" | Duplicate name | Use a different orchard name |
| "File too large" | File > 2GB | Compress or split your file |
| "Invalid PMTiles file" | Corrupted file | Check file integrity |
| "Unauthorized. Please sign in." | Not logged in | Sign in first |

### 🔒 Security & Validation

#### Authentication
- **Required**: Must be signed in
- **Redirect**: Unauthenticated users sent to login page
- **Callback**: Returns to form after successful login

#### Client-Side Validation
- File type checking (.pmtiles only)
- Empty field validation
- Real-time error display

#### Server-Side Validation
- File format verification
- Geographic bounds validation
- File size enforcement
- Duplicate orchard ID check
- SQL injection protection
- Path traversal prevention

### 📈 Upload Process

What happens when you submit:

1. **Validation** - Checks all fields are filled correctly
2. **Form Submission** - Creates FormData with all inputs
3. **Progress Display** - Shows animated progress bar
4. **API Call** - POST to `/api/orchards/create`
5. **Server Processing**:
   - Validates PMTiles file
   - Extracts metadata (bounds, zoom levels)
   - Saves file to `/public/orchards/[id]/tiles/`
   - Inserts into database
   - Updates `orchards.ts` configuration
6. **Success Response** - Shows success message
7. **Redirect** - Navigates to new orchard page

### 🎬 User Flow Example

```
1. User clicks "Add New Orchard" on homepage
   ↓
2. Redirected to /orchards/new
   ↓
3. User fills in:
   - Name: "Mountain View Orchard"
   - Location: "Colorado, USA"
   ↓
4. User drags orthomap.pmtiles file (350MB)
   ↓
5. Form shows: "orthomap.pmtiles (350.00 MB)"
   ↓
6. User clicks "Create Orchard"
   ↓
7. Progress bar appears: "Uploading and processing..."
   ↓
8. Success message: "Orchard Created Successfully!"
   ↓
9. Auto-redirect to: /orchard/mountain-view-orchard
```

### 🎨 Styling Details

#### Colors
- **Primary Green**: `#10b981` (buttons, accents)
- **Background Gradient**: `from-green-50 to-blue-50`
- **Info Blue**: `#3b82f6` (info boxes)
- **Error Red**: `#ef4444` (error messages)
- **Success Green**: `#10b981` (success states)

#### Components
- **Cards**: White background, rounded-xl, shadow-lg
- **Buttons**:
  - Primary: Green with hover shadow
  - Secondary: Gray border with hover background
  - Disabled: 50% opacity
- **Inputs**: Border with green focus ring
- **Upload Zone**: Dashed border, hover effects

### 📱 Responsive Design

#### Desktop (>1024px)
- Max width: 768px (3xl container)
- Full-size form fields
- Large upload zone

#### Tablet (768px-1024px)
- Slightly narrower container
- Maintained spacing

#### Mobile (<768px)
- Full-width container with padding
- Stacked form fields
- Touch-friendly upload zone
- Adjusted font sizes

### 🛠️ Technical Details

#### Component Type
- **Framework**: Next.js 15 with App Router
- **Type**: Client Component (`'use client'`)
- **Authentication**: NextAuth session management
- **Routing**: Next.js navigation hooks

#### State Management
```typescript
- name: string          // Orchard name
- location: string      // Location description
- file: File | null     // Selected PMTiles file
- isDragging: boolean   // Drag-over state
- loading: boolean      // Upload in progress
- error: string         // Error message
- success: boolean      // Upload succeeded
- uploadProgress: number // Progress percentage
```

#### Key Dependencies
- `next-auth/react` - Session management
- `next/navigation` - Routing
- React hooks - State and effects
- Tailwind CSS - Styling

### 💡 Tips for Users

1. **File Preparation**
   - Ensure your PMTiles file is properly georeferenced
   - Test with smaller files first (< 100MB)
   - Keep files under 500MB for best performance

2. **Naming Convention**
   - Use descriptive names (includes location/type)
   - Avoid special characters
   - Example: "Washington Apple Orchard 2024"

3. **Upload Speed**
   - Larger files take longer to upload and process
   - Don't close the browser during upload
   - Wait for success message before leaving page

4. **Testing**
   - Try creating a test orchard with a small file first
   - Verify the orchard appears on the homepage
   - Check that imagery displays correctly

### 🔗 Related Documentation

- [API Documentation](./API-ORCHARD-UPLOAD.md) - Technical API details
- [Upload API Summary](./UPLOAD-API-SUMMARY.md) - Implementation overview
- [PMTiles Format](https://docs.protomaps.com/pmtiles/) - External documentation

## Troubleshooting

### Form Not Loading
- **Issue**: Page shows loading indefinitely
- **Solution**: Check that you're signed in, clear browser cache

### Upload Fails Immediately
- **Issue**: Error before progress bar appears
- **Solution**: Check file is .pmtiles format, try different browser

### Upload Stalls at 90%
- **Issue**: Progress stops before completion
- **Solution**: Large files may take time, wait 2-3 minutes, check server logs

### Success But No Redirect
- **Issue**: Success message shows but doesn't redirect
- **Solution**: Manually navigate to homepage, find new orchard in list

### File Too Large Error
- **Issue**: "File size is X MB. Maximum allowed size is 2GB"
- **Solution**: Compress PMTiles file or split into smaller areas

## Browser Support

Tested and working on:
- ✅ Chrome 120+
- ✅ Firefox 120+
- ✅ Safari 17+
- ✅ Edge 120+

Features used:
- Drag and Drop API
- FormData API
- Fetch API
- CSS Flexbox & Grid
- CSS Transitions & Animations

## Accessibility

- ✅ Keyboard navigation supported
- ✅ Screen reader friendly labels
- ✅ Clear focus indicators
- ✅ ARIA labels on interactive elements
- ✅ Color contrast meets WCAG AA standards
- ✅ Error messages clearly associated with fields

## Future Enhancements

Potential improvements:
- [ ] Preview uploaded imagery before submission
- [ ] Batch upload multiple orchards
- [ ] Edit existing orchard metadata
- [ ] Delete orchard functionality
- [ ] Thumbnail generation from PMTiles
- [ ] Real upload progress from server
- [ ] Pause/resume for large uploads
