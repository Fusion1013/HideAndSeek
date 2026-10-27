-- How a finished game ended: the seekers found the hiders, the host ended it, or nobody played it for too long.
-- Null until the game is finished.
ALTER TABLE game ADD COLUMN outcome text CHECK (outcome IN ('FOUND', 'ENDED', 'ABANDONED'));
-- Games finished before this was recorded: all were ended by their host or by the cleanup, never found
UPDATE game SET outcome = 'ENDED' WHERE status = 'FINISHED';
ALTER TABLE game ADD CONSTRAINT ck_game_outcome_when_finished CHECK ((status = 'FINISHED') = (outcome IS NOT NULL));
