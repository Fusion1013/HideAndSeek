package com.jetlag.service;

import com.jetlag.domain.AgencyEntity;
import com.jetlag.repository.AgencyRepository;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class AgencyBatchWriter implements IBatchWriter<AgencyEntity> {

  private final AgencyRepository agencyRepository;
  private final EntityManager entityManager;

  public AgencyBatchWriter(AgencyRepository agencyRepository, EntityManager entityManager) {
    this.agencyRepository = agencyRepository;
    this.entityManager = entityManager;
  }

  @Override
  @Transactional
  public void saveBatch(List<AgencyEntity> agencies) {
    agencyRepository.saveAll(agencies);
    agencyRepository.flush();
    entityManager.clear();
  }

  @Override
  @Transactional
  public int deleteStale(String generation) {
    return agencyRepository.deleteNotInGeneration(generation);
  }
}
