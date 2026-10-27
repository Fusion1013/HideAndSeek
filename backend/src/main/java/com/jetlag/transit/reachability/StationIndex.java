package com.jetlag.transit.reachability;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The stations reachability is measured between: a parent station with its platforms and entrances merged into
 * it, or a stop without a parent. Changing platforms within a station then costs only the transfer time. Finds
 * the stations near another through a grid of cells about a kilometre across.
 */
final class StationIndex {

  /** A row of gtfs_stops. */
  record Stop(String stopId, String name, Double latitude, Double longitude, String parentStation) {}

  record Station(String stopId, String name, double latitude, double longitude) {}

  @FunctionalInterface
  interface Neighbour {
    void accept(int station, double meters);
  }

  private static final double METERS_PER_DEGREE = 111_195;
  private static final double CELL_DEGREES_LATITUDE = 0.01;
  private static final double CELL_DEGREES_LONGITUDE = 0.02;
  /** Boarding area, platform, station: deeper chains of parents do not occur in GTFS. */
  private static final int MAX_PARENT_DEPTH = 3;

  private final List<Station> stations;
  private final Map<String, Integer> stationByStopId;
  private final Map<Long, int[]> cells;

  private StationIndex(List<Station> stations, Map<String, Integer> stationByStopId, Map<Long, int[]> cells) {
    this.stations = stations;
    this.stationByStopId = stationByStopId;
    this.cells = cells;
  }

  static StationIndex of(Collection<Stop> stops) {
    Map<String, Stop> stopsById = new HashMap<>();
    for (Stop stop : stops) {
      if (stop.latitude() != null && stop.longitude() != null) stopsById.put(stop.stopId(), stop);
    }

    List<Station> stations = new ArrayList<>();
    Map<String, Integer> stationByStopId = new HashMap<>();
    for (Stop stop : stopsById.values()) {
      Stop top = topmost(stop, stopsById);
      Integer station = stationByStopId.get(top.stopId());
      if (station == null) {
        station = stations.size();
        stations.add(new Station(top.stopId(), top.name(), top.latitude(), top.longitude()));
        stationByStopId.put(top.stopId(), station);
      }
      stationByStopId.put(stop.stopId(), station);
    }

    Map<Long, List<Integer>> cellLists = new HashMap<>();
    for (int index = 0; index < stations.size(); index++) {
      Station station = stations.get(index);
      cellLists.computeIfAbsent(cellKey(station.latitude(), station.longitude()), key -> new ArrayList<>()).add(index);
    }
    Map<Long, int[]> cells = new HashMap<>();
    cellLists.forEach((key, members) -> cells.put(key, members.stream().mapToInt(Integer::intValue).toArray()));
    return new StationIndex(stations, stationByStopId, cells);
  }

  private static Stop topmost(Stop stop, Map<String, Stop> stopsById) {
    Stop top = stop;
    for (int depth = 0; depth < MAX_PARENT_DEPTH && top.parentStation() != null; depth++) {
      Stop parent = stopsById.get(top.parentStation());
      if (parent == null) break;
      top = parent;
    }
    return top;
  }

  int size() {
    return stations.size();
  }

  Station station(int index) {
    return stations.get(index);
  }

  /** The station a stop belongs to, or -1 for an unknown stop or one without coordinates. */
  int stationOf(String stopId) {
    Integer station = stopId == null ? null : stationByStopId.get(stopId);
    return station == null ? -1 : station;
  }

  /** Every other station within the radius, in a straight line. */
  void forEachNear(int index, double radiusMeters, Neighbour neighbour) {
    Station origin = stations.get(index);
    double cosLatitude = Math.max(Math.cos(Math.toRadians(origin.latitude())), 0.01);
    double latitudeSpan = radiusMeters / METERS_PER_DEGREE;
    double longitudeSpan = latitudeSpan / cosLatitude;
    long minX = cellX(origin.longitude() - longitudeSpan);
    long maxX = cellX(origin.longitude() + longitudeSpan);
    long minY = cellY(origin.latitude() - latitudeSpan);
    long maxY = cellY(origin.latitude() + latitudeSpan);
    for (long y = minY; y <= maxY; y++) {
      for (long x = minX; x <= maxX; x++) {
        int[] members = cells.get(cellKey(x, y));
        if (members == null) continue;
        for (int other : members) {
          if (other == index) continue;
          double meters = distanceMeters(origin, stations.get(other));
          if (meters <= radiusMeters) neighbour.accept(other, meters);
        }
      }
    }
  }

  /** Equirectangular: well within a metre of the great-circle distance at walking range. */
  static double distanceMeters(Station from, Station to) {
    double meanLatitude = Math.toRadians((from.latitude() + to.latitude()) / 2);
    double dx = (to.longitude() - from.longitude()) * Math.cos(meanLatitude);
    double dy = to.latitude() - from.latitude();
    return Math.sqrt(dx * dx + dy * dy) * METERS_PER_DEGREE;
  }

  private static long cellX(double longitude) {
    return (long) Math.floor(longitude / CELL_DEGREES_LONGITUDE);
  }

  private static long cellY(double latitude) {
    return (long) Math.floor(latitude / CELL_DEGREES_LATITUDE);
  }

  private static long cellKey(double latitude, double longitude) {
    return cellKey(cellX(longitude), cellY(latitude));
  }

  private static long cellKey(long x, long y) {
    return (y << 32) ^ (x & 0xffffffffL);
  }
}
