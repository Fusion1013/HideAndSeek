package com.jetlag.controller;

import com.jetlag.domain.OverpassLocationDTO;
import com.jetlag.domain.OverpassLocationPage;
import com.jetlag.service.OverpassService;
import com.jetlag.util.Bounds;
import com.jetlag.util.OverpassLocationCategory;
import com.jetlag.util.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@RequestMapping("/api/overpass")
@Tag(name = "overpass")
public class OverpassLocationController {

  private static final int MAX_PAGE_SIZE = 1000;

  private final OverpassService overpassService;

  public OverpassLocationController(OverpassService overpassService) {
    this.overpassService = overpassService;
  }

  @Operation(
    operationId = "searchPlaces",
    summary = "Search places",
    description = "Returns a page of places. All filters are optional and can be combined. "
      + "A bounding box requires all four of south, west, north and east.")
  @ApiResponses({
    @ApiResponse(responseCode = "200",
      description = "A page of matching places",
      content = @Content(
        mediaType = MediaType.APPLICATION_JSON_VALUE,
        schema = @Schema(implementation = OverpassLocationPage.class))),
    @ApiResponse(responseCode = "400",
      description = "Incomplete or invalid bounding box, or unknown category",
      content = @Content)
  })
  @GetMapping
  public OverpassLocationPage search(
    @Parameter(description = "Only return places of this category")
    @RequestParam(required = false) OverpassLocationCategory category,
    @Parameter(description = "Southern latitude of the bounding box, -90 to 90", example = "57.7")
    @RequestParam(required = false) Double south,
    @Parameter(description = "Western longitude of the bounding box, -180 to 180", example = "14.0")
    @RequestParam(required = false) Double west,
    @Parameter(description = "Northern latitude of the bounding box, -90 to 90", example = "57.9")
    @RequestParam(required = false) Double north,
    @Parameter(description = "Eastern longitude of the bounding box, -180 to 180", example = "14.3")
    @RequestParam(required = false) Double east,
    @Parameter(description = "Zero-based page index")
    @RequestParam(defaultValue = "0") int page,
    @Parameter(description = "Page size, between 1 and 1000 (larger values are capped)")
    @RequestParam(defaultValue = "100") int size) {

    Bounds bounds = parseBounds(south, west, north, east);
    Pageable pageable = PageRequest.of(
      Math.max(page, 0),
      Math.min(Math.max(size, 1), MAX_PAGE_SIZE),
      Sort.by("id"));

    return OverpassLocationPage.of(overpassService.search(category, bounds, pageable), OverpassLocationDTO::from);
  }

  @Operation(
    operationId = "getPlace",
    summary = "Get a place by id",
    description = "Returns a single place by its internal id.")
  @ApiResponses({
    @ApiResponse(responseCode = "200",
      description = "The place",
      content = @Content(
        mediaType = MediaType.APPLICATION_JSON_VALUE,
        schema = @Schema(implementation = OverpassLocationDTO.class))),
    @ApiResponse(responseCode = "404", description = "No place with that id", content = @Content)
  })
  @GetMapping("/{id}")
  public ResponseEntity<OverpassLocationDTO> get(
    @Parameter(description = "Internal place id") @PathVariable Long id) {
    return overpassService.findById(id)
      .map(OverpassLocationDTO::from)
      .map(ResponseEntity::ok)
      .orElse(ResponseEntity.notFound().build());
  }

  @Operation(
    operationId = "listPlaceCategories",
    summary = "List searchable categories",
    description = "Returns the categories that are imported from Overpass, "
      + "excluding the OTHER fallback.")
  @ApiResponse(responseCode = "200", description = "The searchable categories", content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE, array = @ArraySchema(schema = @Schema(implementation = OverpassLocationCategory.class))))
  @GetMapping("/categories")
  public List<OverpassLocationCategory> categories() {
    return OverpassLocationCategory.searchableCategories();
  }

  private Bounds parseBounds(Double south, Double west, Double north, Double east) {
    boolean any = south != null || west != null || north != null || east != null;
    if (!any) return null;

    if (south == null || west == null || north == null || east == null) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
        "south, west, north and east must all be provided together");
    }
    try {
      return new Bounds(south, west, north, east);
    } catch (IllegalArgumentException e) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
    }
  }
}
