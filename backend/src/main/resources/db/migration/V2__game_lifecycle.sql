-- What a game needs to run without its template: its own name (the template can be renamed or deleted), how long
-- the hiders have, and when that time is up. The end is stored, not computed, so moving the game on to SEEKING
-- is one conditional UPDATE that concurrent requests cannot both apply.
ALTER TABLE game ADD COLUMN name text NOT NULL DEFAULT '';
ALTER TABLE game ALTER COLUMN name DROP DEFAULT;
ALTER TABLE game ADD COLUMN hiding_minutes integer NOT NULL DEFAULT 30 CHECK (hiding_minutes BETWEEN 1 AND 600);
ALTER TABLE game ALTER COLUMN hiding_minutes DROP DEFAULT;
ALTER TABLE game ADD COLUMN hiding_ends_at timestamptz;

-- Finds the games whose hiding time is up
CREATE INDEX ix_game_hiding_ends ON game (hiding_ends_at) WHERE status = 'HIDING';
