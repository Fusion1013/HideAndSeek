package com.jetlag.domain;

import java.time.Instant;

public record VehiclePosition(
        String id,
        String tripId,
        String routeId,
        double latitude,
        double longitude,
        double bearing,
        double speedMetersPerSecond,
        Instant timestamp
) {
}
