package com.jetlag.game.question;

import io.swagger.v3.oas.annotations.media.Schema;

/** What a question is about, and what was true of it when it was asked. */
public record QuestionParams(
  @Schema(description = "The category of place, for matching, measuring and tentacles (e.g. museums, game_station), "
    + "or what to photograph, for photo (e.g. tree)")
  String category,
  @Schema(description = "The distance in metres, for radar, thermometer and tentacles") Integer distanceMeters,
  @Schema(description = "Where the asking seeker last reported being; null if they had not") Position origin,
  @Schema(description = "Where the seekers started moving, for thermometer") Position start,
  @Schema(description = "Where the seekers stopped moving, for thermometer") Position end,
  @Schema(description = "The place of the category nearest the asking seeker when asked, for matching and measuring; "
    + "null if their position was not known or the category has no places") NearestPlace nearest
) {

  public record Position(
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) double longitude,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) double latitude
  ) {

    private static final double EARTH_RADIUS_METERS = 6_371_008.8;

    /** Along the surface of the Earth, taken as a sphere. */
    public int metersTo(Position other) {
      double fromLatitude = Math.toRadians(latitude);
      double toLatitude = Math.toRadians(other.latitude);
      double sinLatitude = Math.sin((toLatitude - fromLatitude) / 2);
      double sinLongitude = Math.sin(Math.toRadians(other.longitude - longitude) / 2);
      double chord = sinLatitude * sinLatitude + Math.cos(fromLatitude) * Math.cos(toLatitude) * sinLongitude * sinLongitude;
      return (int) Math.round(2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(chord)));
    }
  }

  public record NearestPlace(
    @Schema(description = "Its name; null for a place without one") String name,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) double longitude,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) double latitude,
    @Schema(description = "From the asking seeker", requiredMode = Schema.RequiredMode.REQUIRED) int distanceMeters,
    @Schema(description = "As GeoJSON, the area where this is the closest place of its category; null if none was built")
    String cell,
    @Schema(description = "As GeoJSON, for measuring: the part of the play area as close to any place of the category "
      + "as the seekers were to this one") String reach
  ) {

    NearestPlace withReach(String reach) {
      return new NearestPlace(name, longitude, latitude, distanceMeters, cell, reach);
    }
  }
}
