package com.jetlag.controller;

import com.jetlag.domain.StopEntity;
import com.jetlag.repository.StopRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/gtfs")
public class GtfsController {

  private final StopRepository stopRepository;

  public GtfsController(StopRepository stopRepository) {
    this.stopRepository = stopRepository;
  }

  @GetMapping("/stops")
  public List<StopEntity> getStops() {
    return stopRepository.findAll();

  }
}
