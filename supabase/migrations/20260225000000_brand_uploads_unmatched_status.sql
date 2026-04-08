-- Add 'unmatched' to brand_uploads status constraint
ALTER TABLE brand_uploads DROP CONSTRAINT brand_uploads_status_check;
ALTER TABLE brand_uploads ADD CONSTRAINT brand_uploads_status_check
  CHECK (status IN ('pending', 'matched', 'created', 'unmatched'));
