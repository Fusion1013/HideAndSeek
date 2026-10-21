package com.jetlag.service;

import com.jetlag.domain.ShapeEntity;
import com.jetlag.repository.ShapeRepository;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class ShapeBatchWriter implements IBatchWriter<ShapeEntity> {

  private final ShapeRepository shapeRepository;
  private final EntityManager entityManager;

  public ShapeBatchWriter(
    ShapeRepository shapeRepository,
    EntityManager entityManager) {
    this.shapeRepository = shapeRepository;
    this.entityManager = entityManager;
  }

  @Transactional
  public void saveBatch(List<ShapeEntity> shapes) {
    shapeRepository.saveAll(shapes);
    shapeRepository.flush();
    entityManager.clear();
  }

  @Transactional
  public int deleteStale(String generation) {
    return shapeRepository.deleteNotInGeneration(generation);
  }
}
