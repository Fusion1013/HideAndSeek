package com.jetlag.service;

import com.jetlag.domain.RouteEntity;
import com.jetlag.repository.RouteRepository;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class RouteBatchWriter implements IBatchWriter<RouteEntity> {

  private final RouteRepository routeRepository;
  private final EntityManager entityManager;

  public RouteBatchWriter(RouteRepository routeRepository, EntityManager entityManager) {
    this.routeRepository = routeRepository;
    this.entityManager = entityManager;
  }

  @Transactional
  public void saveBatch(List<RouteEntity> entities) {
    routeRepository.saveAll(entities);
    routeRepository.flush();
    entityManager.clear();
  }

  @Transactional
  public int deleteStale(String generation) {
    return routeRepository.deleteNotInGeneration(generation);
  }
}
