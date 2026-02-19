-- Migration: Add company_id to seasons table
-- This makes sales trackers brand-specific instead of global

-- Step 1: Add the column (nullable initially for backfill)
ALTER TABLE seasons ADD COLUMN company_id bigint REFERENCES companies(id);

-- Step 2: Backfill company_id from the most common company in orders for each season
UPDATE seasons s
SET company_id = (
  SELECT o.company_id
  FROM orders o
  WHERE o.season_id = s.id
  GROUP BY o.company_id
  ORDER BY COUNT(*) DESC
  LIMIT 1
)
WHERE s.company_id IS NULL;

-- Step 3: For seasons used by multiple companies, duplicate per company
-- (Creates new season rows for each additional company that references the season)
DO $$
DECLARE
  rec RECORD;
  new_id TEXT;
BEGIN
  FOR rec IN
    SELECT DISTINCT s.id AS season_id, s.label, s.user_id, s.country, s.year,
           s.start_date, s.end_date, s.archived, s.created_at, o.company_id
    FROM seasons s
    JOIN orders o ON o.season_id = s.id
    WHERE o.company_id != s.company_id
  LOOP
    -- Check if a season already exists for this company with the same label
    IF NOT EXISTS (
      SELECT 1 FROM seasons
      WHERE label = rec.label AND company_id = rec.company_id AND user_id = rec.user_id
    ) THEN
      new_id := rec.season_id || '-' || rec.company_id;
      INSERT INTO seasons (id, user_id, label, country, year, start_date, end_date, archived, created_at, company_id)
      VALUES (new_id, rec.user_id, rec.label, rec.country, rec.year, rec.start_date, rec.end_date, rec.archived, rec.created_at, rec.company_id);

      -- Re-point orders from the old season to the new one for this company
      UPDATE orders SET season_id = new_id
      WHERE season_id = rec.season_id AND company_id = rec.company_id;
    END IF;
  END LOOP;
END $$;

-- Verify: All seasons should now have a company_id (except orphans with no orders)
-- SELECT id, label, company_id FROM seasons ORDER BY company_id, label;
