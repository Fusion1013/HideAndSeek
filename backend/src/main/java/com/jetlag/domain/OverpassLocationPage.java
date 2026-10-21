package com.jetlag.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import org.springframework.data.domain.Page;

import java.util.List;
import java.util.function.Function;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

@Schema(description = "A page of places")
public record OverpassLocationPage(
  @Schema(requiredMode = REQUIRED) List<OverpassLocationDTO> content,
  @Schema(requiredMode = REQUIRED, description = "Zero-based page index") int page,
  @Schema(requiredMode = REQUIRED, description = "Requested page size") int size,
  @Schema(requiredMode = REQUIRED, description = "Total matching elements") long totalElements,
  @Schema(requiredMode = REQUIRED, description = "Total number of pages") int totalPages) {

  public static <E> OverpassLocationPage of(Page<E> page, Function<E, OverpassLocationDTO> mapper) {
    return new OverpassLocationPage(
      page.getContent().stream().map(mapper).toList(),
      page.getNumber(), page.getSize(), page.getTotalElements(), page.getTotalPages());
  }
}
