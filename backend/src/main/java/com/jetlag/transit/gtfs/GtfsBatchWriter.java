package com.jetlag.transit.gtfs;

import com.jetlag.transit.repository.GtfsRepository;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** Writes GTFS rows in batches, each in its own transaction, so a large import never holds everything in memory. */
@Service
class GtfsBatchWriter {

  private final EntityManager entityManager;

  GtfsBatchWriter(EntityManager entityManager) {
    this.entityManager = entityManager;
  }

  @Transactional
  public <T> void saveBatch(GtfsRepository<T, ?> repository, List<T> entities) {
    repository.saveAll(entities);
    repository.flush();
    entityManager.clear();
  }

  @Transactional
  public int deleteStale(GtfsRepository<?, ?> repository, String generation) {
    return repository.deleteNotInGeneration(generation);
  }
}
