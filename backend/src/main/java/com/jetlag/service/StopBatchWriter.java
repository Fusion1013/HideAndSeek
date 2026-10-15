package com.jetlag.service;

import com.jetlag.domain.StopEntity;
import com.jetlag.repository.StopRepository;

import jakarta.persistence.EntityManager;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class StopBatchWriter {

  private final StopRepository stopRepository;
  private final EntityManager entityManager;

  public StopBatchWriter(
    StopRepository stopRepository,
    EntityManager entityManager) {
    this.stopRepository = stopRepository;
    this.entityManager = entityManager;
  }

  @Transactional
  public void saveBatch(List<StopEntity> stops) {
    stopRepository.saveAll(stops);
    stopRepository.flush();

    // Prevent JPA from retaining every imported entity.
    entityManager.clear();
  }

  @Transactional
  public int deleteStaleStops(String generation) {
    return stopRepository.deleteNotInGeneration(generation);
  }
}
