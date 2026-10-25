-- Everything that happens in a game, in order: pushed to the players as it happens, and replayed to a player
-- who reconnects (with the ID of the last event they saw). Game changes lock the game's row, so within a game
-- the IDs follow the order the changes were committed in.
CREATE TABLE game_event (
  id         bigserial PRIMARY KEY,
  game_id    uuid NOT NULL REFERENCES game ON DELETE CASCADE,
  type       text NOT NULL,
  -- Who may see it; an event for one side must never reach the other
  audience   text NOT NULL CHECK (audience IN ('ALL', 'SEEKERS', 'HIDERS')),
  payload    jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_game_event_game ON game_event (game_id, id);
