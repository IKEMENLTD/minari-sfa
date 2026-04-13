-- Add title and thumbnail_url columns to meetings table
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
