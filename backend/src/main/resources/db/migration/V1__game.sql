-- Game tables are owned by Flyway; Hibernate still manages the GTFS and Overpass tables (see FlywayOwnedTables).
-- PostGIS was enabled by schema.sql before; Flyway runs first now, so it is enabled here.
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE game_template (
  id               uuid PRIMARY KEY,
  name             text NOT NULL,
  boundary         geometry(Polygon, 4326) NOT NULL,
  settings         jsonb NOT NULL DEFAULT '{}',
  owner_token_hash bytea NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- No foreign key to gtfs_routes: a GTFS import deletes routes that are no longer published.
-- The names are a snapshot, so a route that disappeared can still be shown.
CREATE TABLE game_template_route (
  template_id      uuid NOT NULL REFERENCES game_template ON DELETE CASCADE,
  route_id         text NOT NULL,
  route_short_name text,
  agency_name      text,
  route_type       text,
  PRIMARY KEY (template_id, route_id)
);

-- Boundary, settings, routes and stations are copied from the template, so editing the template or importing
-- new GTFS data never changes a game that already exists.
CREATE TABLE game (
  id                 uuid PRIMARY KEY,
  template_id        uuid REFERENCES game_template ON DELETE SET NULL,
  invite_code        varchar(8) NOT NULL,
  status             text NOT NULL CHECK (status IN ('LOBBY', 'HIDING', 'SEEKING', 'FINISHED')),
  boundary           geometry(Polygon, 4326) NOT NULL,
  settings           jsonb NOT NULL DEFAULT '{}',
  hiding_started_at  timestamptz,
  seeking_started_at timestamptz,
  finished_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  version            bigint NOT NULL DEFAULT 0
);

-- Codes only need to be unique among games that can still be joined; finished games free theirs
CREATE UNIQUE INDEX ux_game_active_invite_code ON game (invite_code) WHERE status <> 'FINISHED';
CREATE INDEX ix_game_template ON game (template_id);

CREATE TABLE game_route (
  game_id          uuid NOT NULL REFERENCES game ON DELETE CASCADE,
  route_id         text NOT NULL,
  route_short_name text,
  agency_name      text,
  route_type       text,
  PRIMARY KEY (game_id, route_id)
);

-- The stations a hider may choose: stops served by the game's routes inside its boundary, by parent station
CREATE TABLE game_station (
  game_id    uuid NOT NULL REFERENCES game ON DELETE CASCADE,
  station_id text NOT NULL,
  name       text NOT NULL,
  location   geometry(Point, 4326) NOT NULL,
  PRIMARY KEY (game_id, station_id)
);

CREATE TABLE game_player (
  id           uuid PRIMARY KEY,
  game_id      uuid NOT NULL REFERENCES game ON DELETE CASCADE,
  display_name text NOT NULL,
  role         text CHECK (role IN ('SEEKER', 'HIDER')),
  is_host      boolean NOT NULL DEFAULT false,
  token_hash   bytea NOT NULL UNIQUE,
  joined_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  UNIQUE (game_id, display_name)
);
