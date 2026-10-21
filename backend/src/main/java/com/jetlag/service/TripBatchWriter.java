package com.jetlag.service;

import com.jetlag.domain.TripEntity;
import com.jetlag.repository.TripRepository;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class TripBatchWriter implements IBatchWriter<TripEntity> {

  private final TripRepository tripRepository;
  private final EntityManager entityManager;

  public TripBatchWriter(
    TripRepository tripRepository,
    EntityManager entityManager) {
    this.tripRepository = tripRepository;
    this.entityManager = entityManager;
  }

  @Transactional
  public void saveBatch(List<TripEntity> trips) {
    tripRepository.saveAll(trips);
    tripRepository.flush();
    entityManager.clear();
  }

  @Transactional
  public int deleteStale(String generation) {
    return tripRepository.deleteNotInGeneration(generation);
  }
}
