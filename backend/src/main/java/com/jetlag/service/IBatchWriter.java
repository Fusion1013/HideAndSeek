package com.jetlag.service;

import java.util.List;

public interface IBatchWriter<T> {
  void saveBatch(java.util.List<T> entities);
  int deleteStale(String generation);
}
