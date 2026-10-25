package com.jetlag.config;

import org.hibernate.boot.model.relational.Namespace;
import org.hibernate.boot.model.relational.Sequence;
import org.hibernate.mapping.Table;
import org.hibernate.tool.schema.spi.SchemaFilter;
import org.hibernate.tool.schema.spi.SchemaFilterProvider;

/**
 * Keeps Hibernate's schema update away from the tables Flyway creates (src/main/resources/db/migration).
 * Without it, an entity that drifted from its migration would get a column added silently, with whatever type
 * Hibernate guesses; this way the mismatch fails as an SQL error in the tests instead.
 */
public class FlywayOwnedTables implements SchemaFilterProvider {

  private static final SchemaFilter EXCLUDE_GAME_TABLES = new SchemaFilter() {
    @Override
    public boolean includeNamespace(Namespace namespace) {
      return true;
    }

    @Override
    public boolean includeTable(Table table) {
      return !isFlywayOwned(table.getName());
    }

    @Override
    public boolean includeSequence(Sequence sequence) {
      return true;
    }
  };

  /** Every table from the game migrations is named game or game_*. */
  static boolean isFlywayOwned(String tableName) {
    return tableName.equals("game") || tableName.startsWith("game_");
  }

  @Override
  public SchemaFilter getCreateFilter() {
    return EXCLUDE_GAME_TABLES;
  }

  @Override
  public SchemaFilter getDropFilter() {
    return EXCLUDE_GAME_TABLES;
  }

  @Override
  public SchemaFilter getTruncatorFilter() {
    return SchemaFilter.ALL;
  }

  @Override
  public SchemaFilter getMigrateFilter() {
    return EXCLUDE_GAME_TABLES;
  }

  @Override
  public SchemaFilter getValidateFilter() {
    return SchemaFilter.ALL;
  }
}
