-- Brand Imports Review Workflow
-- Adds reviewed/dismissed statuses, season_id column, and rep UPDATE policy

-- 1. Drop and recreate status constraint to include new values
ALTER TABLE brand_uploads DROP CONSTRAINT IF EXISTS brand_uploads_status_check;
ALTER TABLE brand_uploads ADD CONSTRAINT brand_uploads_status_check
  CHECK (status IN ('pending', 'matched', 'created', 'unmatched', 'reviewed', 'dismissed'));

-- 2. Add season_id column
ALTER TABLE brand_uploads ADD COLUMN IF NOT EXISTS season_id text REFERENCES seasons(id);

-- 3. Allow reps to update uploads assigned to them
CREATE POLICY "Reps can update uploads to them"
  ON brand_uploads FOR UPDATE USING (auth.uid() = rep_id);
