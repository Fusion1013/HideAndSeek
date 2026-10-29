-- The server's VAPID key pair (RFC 8292), made the first time a push is set up and kept, since every browser's
-- subscription is tied to its public key. One row.
CREATE TABLE game_push_key (
  id          smallint PRIMARY KEY CHECK (id = 1),
  public_key  text NOT NULL,
  private_key text NOT NULL,
  created_at  timestamptz NOT NULL
);

-- Where to send a player's notifications: their browser's push subscription, one per player (a player is one
-- browser). Removed when the push service says it no longer exists.
CREATE TABLE game_push_subscription (
  player_id  uuid PRIMARY KEY REFERENCES game_player ON DELETE CASCADE,
  endpoint   text NOT NULL,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  created_at timestamptz NOT NULL
);
