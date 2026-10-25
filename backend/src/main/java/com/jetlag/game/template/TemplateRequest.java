package com.jetlag.game.template;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;

/** A template as Create mode sends it, to create one or to replace an existing one's contents. */
public record TemplateRequest(
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED, maxLength = TemplateRequest.MAX_NAME_LENGTH)
  String name,
  @Schema(description = "The play area's outline as [longitude, latitude] positions; "
    + "the ring is closed if the last position differs from the first", requiredMode = Schema.RequiredMode.REQUIRED)
  List<List<Double>> boundary,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED)
  List<String> routeIds
) {
  public static final int MAX_NAME_LENGTH = 100;
}
