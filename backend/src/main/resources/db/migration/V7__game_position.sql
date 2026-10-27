-- Every position a player reported while the game ran, for the replay once it is over. Seekers and hiders both
-- report; a hider's positions are never shown to anyone until the game is finished.
CREATE TABLE game_position (
  id          bigserial PRIMARY KEY,
  game_id     uuid NOT NULL REFERENCES game ON DELETE CASCADE,
  player_id   uuid NOT NULL REFERENCES game_player ON DELETE CASCADE,
  location    geometry(Point, 4326) NOT NULL,
  accuracy_m  real CHECK (accuracy_m >= 0),
  recorded_at timestamptz NOT NULL
);

CREATE INDEX ix_game_position_game ON game_position (game_id, player_id, recorded_at);

-- Until now, only the seekers' positions were kept, as events for the hiders
INSERT INTO game_position (game_id, player_id, location, accuracy_m, recorded_at)
SELECT event.game_id,
       (event.payload ->> 'playerId')::uuid,
       ST_SetSRID(ST_MakePoint((event.payload ->> 'longitude')::double precision,
                               (event.payload ->> 'latitude')::double precision), 4326),
       (event.payload ->> 'accuracyMeters')::real,
       (event.payload ->> 'recordedAt')::timestamptz
FROM game_event event
JOIN game_player player ON player.id = (event.payload ->> 'playerId')::uuid
WHERE event.type = 'seeker-location'
ORDER BY event.id;
