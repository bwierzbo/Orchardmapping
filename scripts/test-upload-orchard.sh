#!/bin/bash

# Test script for orchard PMTiles upload API
# Usage: ./test-upload-orchard.sh [path-to-pmtiles-file]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# API endpoint
API_URL="http://localhost:3000/api/orchards/create"

# Check if file path is provided
if [ -z "$1" ]; then
    echo -e "${RED}Error: PMTiles file path required${NC}"
    echo "Usage: $0 [path-to-pmtiles-file]"
    echo "Example: $0 /path/to/orthomap.pmtiles"
    exit 1
fi

PMTILES_FILE="$1"

# Check if file exists
if [ ! -f "$PMTILES_FILE" ]; then
    echo -e "${RED}Error: File not found: $PMTILES_FILE${NC}"
    exit 1
fi

# Check if file has .pmtiles extension
if [[ ! "$PMTILES_FILE" =~ \.pmtiles$ ]]; then
    echo -e "${YELLOW}Warning: File does not have .pmtiles extension${NC}"
fi

echo -e "${GREEN}Testing Orchard Upload API${NC}"
echo "================================"
echo "API URL: $API_URL"
echo "File: $PMTILES_FILE"
echo ""

# Get file size
FILE_SIZE=$(du -h "$PMTILES_FILE" | cut -f1)
echo "File size: $FILE_SIZE"
echo ""

# Test orchard details (you can modify these)
ORCHARD_NAME="Test Orchard $(date +%s)"
ORCHARD_LOCATION="Test Location, USA"

echo "Orchard Name: $ORCHARD_NAME"
echo "Orchard Location: $ORCHARD_LOCATION"
echo ""

# Prompt for confirmation
read -p "Proceed with upload? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Y]$ ]]; then
    echo -e "${YELLOW}Upload cancelled${NC}"
    exit 0
fi

echo ""
echo -e "${YELLOW}Note: You must be logged in to http://localhost:3000${NC}"
echo "The script will use cookies from your browser session"
echo ""

# Check if cookies.txt exists
if [ ! -f "cookies.txt" ]; then
    echo -e "${RED}Error: cookies.txt not found${NC}"
    echo ""
    echo "To create cookies.txt:"
    echo "1. Sign in to http://localhost:3000"
    echo "2. Open browser DevTools (F12)"
    echo "3. Go to Application/Storage > Cookies"
    echo "4. Copy the 'next-auth.session-token' value"
    echo "5. Create cookies.txt in this directory with content:"
    echo "   localhost	FALSE	/	FALSE	0	next-auth.session-token	YOUR_TOKEN_HERE"
    echo ""
    echo "Or use curl with -c option to save cookies after login"
    exit 1
fi

echo -e "${GREEN}Uploading...${NC}"
echo ""

# Make the API request
RESPONSE=$(curl -X POST "$API_URL" \
    -b cookies.txt \
    -F "name=$ORCHARD_NAME" \
    -F "location=$ORCHARD_LOCATION" \
    -F "pmtilesFile=@$PMTILES_FILE" \
    -w "\n%{http_code}" \
    -s)

# Extract HTTP status code (last line)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
# Extract JSON response (everything except last line)
JSON_RESPONSE=$(echo "$RESPONSE" | sed '$d')

echo "HTTP Status: $HTTP_CODE"
echo ""
echo "Response:"
echo "$JSON_RESPONSE" | jq '.' 2>/dev/null || echo "$JSON_RESPONSE"
echo ""

# Check status code
if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 201 ]; then
    echo -e "${GREEN}✓ Upload successful!${NC}"

    # Extract orchard ID if available
    ORCHARD_ID=$(echo "$JSON_RESPONSE" | jq -r '.orchardId' 2>/dev/null)
    if [ "$ORCHARD_ID" != "null" ] && [ -n "$ORCHARD_ID" ]; then
        echo ""
        echo "Orchard ID: $ORCHARD_ID"
        echo "View at: http://localhost:3000/orchard/$ORCHARD_ID"
    fi
else
    echo -e "${RED}✗ Upload failed${NC}"
    exit 1
fi
