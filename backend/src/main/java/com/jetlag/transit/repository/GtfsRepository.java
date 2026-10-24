package com.jetlag.transit.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.repository.NoRepositoryBean;

/** A repository for one GTFS table, imported in generations: each import replaces what the previous one wrote. */
@NoRepositoryBean
public interface GtfsRepository<T, ID> extends JpaRepository<T, ID> {

  /** Deletes rows left over from earlier imports. */
  int deleteNotInGeneration(String generation);
}
