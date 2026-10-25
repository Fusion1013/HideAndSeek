-- Where each player was last seen: seekers report their position while the game runs, and the hiders see it.
ALTER TABLE game_player ADD COLUMN last_location geometry(Point, 4326);
ALTER TABLE game_player ADD COLUMN last_location_accuracy_m real CHECK (last_location_accuracy_m >= 0);
ALTER TABLE game_player ADD COLUMN last_location_at timestamptz;

-- The hiders' station. Kept apart from game and game_player so it cannot leak through anything that reads those;
-- only the hiders may ever see it. One per game: the hiders hide together, and any of them may change it while
-- the hiding time lasts.
CREATE TABLE game_hiding_spot (
  game_id    uuid PRIMARY KEY REFERENCES game ON DELETE CASCADE,
  station_id text NOT NULL,
  chosen_by  uuid NOT NULL REFERENCES game_player ON DELETE CASCADE,
  chosen_at  timestamptz NOT NULL,
  FOREIGN KEY (game_id, station_id) REFERENCES game_station
);
