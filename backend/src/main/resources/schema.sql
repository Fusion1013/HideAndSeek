-- Runs before Hibernate builds the schema, which needs PostGIS for the overpass_geometry column.
-- The postgis image only installs the extension into a new database, not into one created by plain Postgres.
CREATE EXTENSION IF NOT EXISTS postgis;
