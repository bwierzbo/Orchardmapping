-- Migration: photo attachments on tree events (Vercel Blob URLs).
ALTER TABLE tree_events ADD COLUMN IF NOT EXISTS photo_url TEXT;
