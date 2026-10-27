package com.jetlag.transit.reachability;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * Earliest arrival at every station from one origin, by the Connection Scan Algorithm (Dibbelt et al.): the
 * connections are scanned once in departure order, and a trip can be ridden from the first connection that
 * departs from a station reached in time. Walking between stations is in a straight line.
 */
final class ConnectionScan {

  /** Arrival at a station that cannot be reached in time. */
  static final int UNREACHED = Integer.MAX_VALUE;
  /** No label: the station is not reached, or a label has no previous one. */
  private static final int NONE = -1;

  /**
   * How the traveller moves.
   *
   * @param walkingMetersPerSecond walking speed, in a straight line
   * @param transferSeconds        time needed before boarding at a station reached by vehicle or on foot; none
   *                               at the origin, where the traveller is already waiting
   * @param maxTransferWalkMeters  longest walk between two vehicles
   * @param maxFinalWalkMeters     longest walk after the last vehicle; from the origin, walking is not limited
   */
  record Profile(double walkingMetersPerSecond, int transferSeconds, double maxTransferWalkMeters,
                 double maxFinalWalkMeters) {}

  /** One part of a journey: a ride on a trip from one connection to another, or a walk between two stations. */
  sealed interface Leg permits Ride, Walk {
    int arrival();
  }

  /** Riding from the departure of {@code boardConnection} to the arrival of {@code alightConnection}, one trip. */
  record Ride(int boardConnection, int alightConnection, int arrival) implements Leg {}

  /** Walking from one station to another, leaving at {@code departure}; times are seconds after the start. */
  record Walk(int from, int to, int departure, int arrival) implements Leg {}

  /**
   * The result of a scan: the earliest arrivals, and how each was reached. Every improvement of a station's
   * arrival is kept as a label pointing at the label it continued from, so a journey stays valid even when the
   * station it started from is reached earlier later on.
   */
  static final class Result {
    private final int[] arrival;
    private final int[] label;
    private final Labels labels;

    private Result(int[] arrival, int[] label, Labels labels) {
      this.arrival = arrival;
      this.label = label;
      this.labels = labels;
    }

    /** Seconds after the start to reach each station, or {@link #UNREACHED} if not within the duration. */
    int[] arrivals() {
      return arrival;
    }

    /** How to reach the station soonest, in order; empty for the origin or a station that is not reached. */
    List<Leg> journey(int station) {
      List<Leg> legs = new ArrayList<>();
      for (int current = label[station]; current != NONE && labels.kind(current) != Labels.ORIGIN;
           current = labels.previous(current)) {
        if (labels.kind(current) == Labels.RIDE) {
          legs.add(new Ride(labels.board(current), labels.alight(current), labels.arrival(current)));
        } else {
          int departure = labels.arrival(labels.previous(current));
          legs.add(new Walk(labels.walkFrom(current), labels.station(current), departure, labels.arrival(current)));
        }
      }
      Collections.reverse(legs);
      return legs;
    }
  }

  private ConnectionScan() {
  }

  /** Seconds after the start to reach each station, or {@link #UNREACHED} if not within the duration. */
  static int[] earliestArrivals(StationIndex stations, Timetable timetable, int origin, int durationSeconds,
                                Profile profile) {
    return scan(stations, timetable, origin, durationSeconds, profile).arrivals();
  }

  static Result scan(StationIndex stations, Timetable timetable, int origin, int durationSeconds, Profile profile) {
    Labels labels = new Labels();
    int[] arrival = new int[stations.size()];
    int[] label = new int[stations.size()];
    Arrays.fill(arrival, UNREACHED);
    Arrays.fill(label, NONE);
    arrival[origin] = 0;
    label[origin] = labels.origin(origin);
    walkFrom(stations, arrival, label, labels, origin, Double.POSITIVE_INFINITY, durationSeconds, profile);

    // For each trip ridden: the connection it was boarded at, and the label of the station boarded at then
    int[] boardedAt = new int[timetable.tripCount()];
    int[] boardedLabel = new int[timetable.tripCount()];
    Arrays.fill(boardedAt, NONE);
    for (int index = 0; index < timetable.size(); index++) {
      int departure = timetable.departure(index);
      int trip = timetable.trip(index);
      if (boardedAt[trip] == NONE) {
        int from = timetable.from(index);
        if (!timetable.boardable(index) || arrival[from] == UNREACHED) continue;
        int ready = from == origin ? 0 : arrival[from] + profile.transferSeconds();
        if (ready > departure) continue;
        boardedAt[trip] = index;
        boardedLabel[trip] = label[from];
      }

      int to = timetable.to(index);
      int arrivalTime = timetable.arrival(index);
      if (timetable.alightable(index) && arrivalTime < arrival[to] && arrivalTime <= durationSeconds) {
        arrival[to] = arrivalTime;
        label[to] = labels.ride(to, arrivalTime, boardedLabel[trip], boardedAt[trip], index);
        walkFrom(stations, arrival, label, labels, to, profile.maxTransferWalkMeters(), durationSeconds, profile);
      }
    }

    // Walking on from where the vehicles went. From the arrivals before these walks: walking on from a station
    // reached on foot is never shorter than walking straight there.
    int[] byVehicle = arrival.clone();
    int[] byVehicleLabel = label.clone();
    for (int station = 0; station < byVehicle.length; station++) {
      if (station != origin && byVehicle[station] < durationSeconds) {
        walkFrom(stations, arrival, label, labels, station, byVehicle[station], byVehicleLabel[station],
          profile.maxFinalWalkMeters(), durationSeconds, profile);
      }
    }
    return new Result(arrival, label, labels);
  }

  private static void walkFrom(StationIndex stations, int[] arrival, int[] label, Labels labels, int from,
                               double maxMeters, int durationSeconds, Profile profile) {
    walkFrom(stations, arrival, label, labels, from, arrival[from], label[from], maxMeters, durationSeconds, profile);
  }

  private static void walkFrom(StationIndex stations, int[] arrival, int[] label, Labels labels, int from,
                               int startSeconds, int startLabel, double maxMeters, int durationSeconds,
                               Profile profile) {
    double speed = profile.walkingMetersPerSecond();
    double radius = Math.min(maxMeters, (durationSeconds - startSeconds) * speed);
    if (radius <= 0) return;
    stations.forEachNear(from, radius, (to, meters) -> {
      int walked = startSeconds + (int) Math.ceil(meters / speed);
      if (walked < arrival[to] && walked <= durationSeconds) {
        arrival[to] = walked;
        label[to] = labels.walk(to, walked, startLabel, from);
      }
    });
  }

  /** The labels of a scan, in growing parallel arrays. */
  private static final class Labels {
    static final byte ORIGIN = 0;
    static final byte RIDE = 1;
    static final byte WALK = 2;

    private byte[] kind = new byte[1024];
    private int[] station = new int[1024];
    private int[] arrival = new int[1024];
    private int[] previous = new int[1024];
    /** The boarding connection of a ride, or the station walked from. */
    private int[] first = new int[1024];
    /** The alighting connection of a ride. */
    private int[] second = new int[1024];
    private int size;

    int origin(int originStation) {
      return add(ORIGIN, originStation, 0, NONE, NONE, NONE);
    }

    int ride(int toStation, int arrivalTime, int previousLabel, int boardConnection, int alightConnection) {
      return add(RIDE, toStation, arrivalTime, previousLabel, boardConnection, alightConnection);
    }

    int walk(int toStation, int arrivalTime, int previousLabel, int fromStation) {
      return add(WALK, toStation, arrivalTime, previousLabel, fromStation, NONE);
    }

    byte kind(int label) {
      return kind[label];
    }

    int station(int label) {
      return station[label];
    }

    int arrival(int label) {
      return arrival[label];
    }

    int previous(int label) {
      return previous[label];
    }

    int board(int label) {
      return first[label];
    }

    int alight(int label) {
      return second[label];
    }

    int walkFrom(int label) {
      return first[label];
    }

    private int add(byte labelKind, int labelStation, int arrivalTime, int previousLabel, int firstValue,
                    int secondValue) {
      if (size == kind.length) {
        int capacity = size * 2;
        kind = Arrays.copyOf(kind, capacity);
        station = Arrays.copyOf(station, capacity);
        arrival = Arrays.copyOf(arrival, capacity);
        previous = Arrays.copyOf(previous, capacity);
        first = Arrays.copyOf(first, capacity);
        second = Arrays.copyOf(second, capacity);
      }
      kind[size] = labelKind;
      station[size] = labelStation;
      arrival[size] = arrivalTime;
      previous[size] = previousLabel;
      first[size] = firstValue;
      second[size] = secondValue;
      return size++;
    }
  }
}
