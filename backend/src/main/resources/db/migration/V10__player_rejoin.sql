-- A one-time code the host makes for a player who lost their place, so they can rejoin on any browser or device.
-- Only the hash is stored, like the player's token.
ALTER TABLE game_player ADD COLUMN rejoin_code_hash bytea UNIQUE;
ALTER TABLE game_player ADD COLUMN rejoin_code_expires_at timestamptz;
