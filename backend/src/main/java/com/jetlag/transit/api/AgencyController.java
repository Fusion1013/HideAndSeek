package com.jetlag.transit.api;

import com.jetlag.transit.repository.AgencyRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/agencies")
public class AgencyController {

  private final AgencyRepository agencyRepository;

  public AgencyController(AgencyRepository agencyRepository) {
    this.agencyRepository = agencyRepository;
  }

  @GetMapping()
  @Operation(
    operationId = "getAgencies",
    summary = "Get all agencies",
    responses = @ApiResponse(
      responseCode = "200",
      description = "List of all agencies",
      content = @Content(
        mediaType = MediaType.APPLICATION_JSON_VALUE,
        array = @ArraySchema(schema = @Schema(implementation = AgencyDTO.class))
      )
    )
  )
  public List<AgencyDTO> getAgencies() {
    return AgencyDTO.from(agencyRepository.findAll());
  }
}
