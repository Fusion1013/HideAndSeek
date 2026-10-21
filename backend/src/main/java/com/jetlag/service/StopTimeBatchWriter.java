package com.jetlag.service;

import com.jetlag.domain.StopTimeEntity;
import com.jetlag.repository.StopTimeRepository;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class StopTimeBatchWriter implements IBatchWriter<StopTimeEntity> {

  private final StopTimeRepository stopTimeRepository;
  private final EntityManager entityManager;

  public StopTimeBatchWriter(
    StopTimeRepository stopTimeRepository,
    EntityManager entityManager) {
    this.stopTimeRepository = stopTimeRepository;
    this.entityManager = entityManager;
  }

  @Transactional
  public void saveBatch(List<StopTimeEntity> stopTimes) {
    stopTimeRepository.saveAll(stopTimes);
    stopTimeRepository.flush();
    entityManager.clear();
  }

  @Transactional
  public int deleteStale(String generation) {
    return stopTimeRepository.deleteNotInGeneration(generation);
  }
}
