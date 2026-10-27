package com.jetlag.transit.reachability;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * The connections in a time window: a vehicle going from one station to its next, with times in seconds after
 * the start of the window. Kept in parallel arrays, sorted by departure, since a window of a few hours holds
 * millions of them.
 */
final class Timetable {

  /** Times are packed into 16 bits each for sorting. */
  static final int MAX_SECONDS = Short.MAX_VALUE;

  private final int[] trip;
  private final int[] from;
  private final int[] to;
  private final int[] departure;
  private final int[] arrival;
  private final boolean[] boardable;
  private final boolean[] alightable;
  private final int tripCount;
  private final String[] tripIds;

  private Timetable(Builder builder, int[] order) {
    int size = order.length;
    trip = new int[size];
    from = new int[size];
    to = new int[size];
    departure = new int[size];
    arrival = new int[size];
    boardable = new boolean[size];
    alightable = new boolean[size];
    for (int index = 0; index < size; index++) {
      int source = order[index];
      trip[index] = builder.trip[source];
      from[index] = builder.from[source];
      to[index] = builder.to[source];
      departure[index] = builder.departure[source];
      arrival[index] = builder.arrival[source];
      boardable[index] = builder.boardable[source];
      alightable[index] = builder.alightable[source];
    }
    tripCount = builder.tripCount;
    tripIds = builder.tripIds.toArray(String[]::new);
  }

  int size() {
    return trip.length;
  }

  int tripCount() {
    return tripCount;
  }

  /** The GTFS trip_id of a trip, or null when it was started without one. */
  String tripId(int trip) {
    return tripIds[trip];
  }

  int trip(int index) {
    return trip[index];
  }

  int from(int index) {
    return from[index];
  }

  int to(int index) {
    return to[index];
  }

  int departure(int index) {
    return departure[index];
  }

  int arrival(int index) {
    return arrival[index];
  }

  /** Whether passengers may get on at the departure station. */
  boolean boardable(int index) {
    return boardable[index];
  }

  /** Whether passengers may get off at the arrival station. */
  boolean alightable(int index) {
    return alightable[index];
  }

  static Builder builder() {
    return new Builder();
  }

  static final class Builder {
    private int[] trip = new int[1024];
    private int[] from = new int[1024];
    private int[] to = new int[1024];
    private int[] departure = new int[1024];
    private int[] arrival = new int[1024];
    private boolean[] boardable = new boolean[1024];
    private boolean[] alightable = new boolean[1024];
    private int size;
    private int tripCount;
    /** Null for trips started without an id. */
    private final List<String> tripIds = new ArrayList<>();

    /** A new trip; the connections added after it belong to it. Returns its number. */
    int startTrip() {
      return startTrip(null);
    }

    /** A new trip of the GTFS trip with this id. */
    int startTrip(String tripId) {
      tripIds.add(tripId);
      return tripCount++;
    }

    /**
     * Adds a connection of the current trip. Connections of one trip must be added in their order along it, so
     * that ones taking no time keep that order.
     */
    void add(int fromStation, int toStation, int departureSeconds, int arrivalSeconds, boolean canBoard, boolean canAlight) {
      if (tripCount == 0) throw new IllegalStateException("No trip started");
      if (departureSeconds < 0 || arrivalSeconds < departureSeconds || arrivalSeconds > MAX_SECONDS) {
        throw new IllegalArgumentException("Times out of range: " + departureSeconds + ", " + arrivalSeconds);
      }
      if (size == trip.length) grow();
      trip[size] = tripCount - 1;
      from[size] = fromStation;
      to[size] = toStation;
      departure[size] = departureSeconds;
      arrival[size] = arrivalSeconds;
      boardable[size] = canBoard;
      alightable[size] = canAlight;
      size++;
    }

    Timetable build() {
      // By departure, then arrival, then the order added: a primitive sort of packed keys, not of boxed indexes
      long[] keys = new long[size];
      for (int index = 0; index < size; index++) {
        keys[index] = ((long) departure[index] << 48) | ((long) arrival[index] << 32) | index;
      }
      Arrays.sort(keys);
      int[] order = new int[size];
      for (int index = 0; index < size; index++) order[index] = (int) keys[index];
      return new Timetable(this, order);
    }

    private void grow() {
      int capacity = trip.length * 2;
      trip = Arrays.copyOf(trip, capacity);
      from = Arrays.copyOf(from, capacity);
      to = Arrays.copyOf(to, capacity);
      departure = Arrays.copyOf(departure, capacity);
      arrival = Arrays.copyOf(arrival, capacity);
      boardable = Arrays.copyOf(boardable, capacity);
      alightable = Arrays.copyOf(alightable, capacity);
    }
  }
}
