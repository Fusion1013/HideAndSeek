package com.jetlag.game.template;

import com.jetlag.game.auth.BearerToken;
import com.jetlag.game.auth.GameAuthConfig;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * Game templates, made in Create mode. There are no accounts: creating a template returns an owner token, which
 * the creator's browser keeps and sends to change or delete it.
 */
@RestController
// Declared, so the API document says JSON rather than */*; the generated client reads */* responses as blobs
@RequestMapping(value = "/api/templates", produces = MediaType.APPLICATION_JSON_VALUE)
public class GameTemplateController {

  private final GameTemplateService templateService;

  public GameTemplateController(GameTemplateService templateService) {
    this.templateService = templateService;
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  @Operation(
    operationId = "createTemplate",
    summary = "Create a game template",
    description = "Returns the template and its owner token; the token is not sent again.",
    responses = {
      @ApiResponse(responseCode = "201", description = "The new template and its owner token"),
      @ApiResponse(responseCode = "400", description = "Missing name, unusable area, or unknown route")
    }
  )
  public CreatedTemplateDTO createTemplate(@RequestBody TemplateRequest request) {
    return templateService.create(request);
  }

  @GetMapping
  @Operation(
    operationId = "getTemplates",
    summary = "Get several templates by ID",
    description = "For listing the templates this browser created. IDs that do not exist are left out.",
    responses = @ApiResponse(responseCode = "200", description = "The templates, in the order asked for")
  )
  public List<TemplateDTO> getTemplates(@RequestParam List<UUID> ids) {
    return templateService.list(ids);
  }

  @GetMapping("/{templateId}")
  @Operation(
    operationId = "getTemplate",
    summary = "Get a game template",
    responses = {
      @ApiResponse(responseCode = "200", description = "The template"),
      @ApiResponse(responseCode = "404", description = "No such template")
    }
  )
  public TemplateDTO getTemplate(@PathVariable UUID templateId) {
    return templateService.get(templateId);
  }

  @PutMapping("/{templateId}")
  @SecurityRequirement(name = GameAuthConfig.TEMPLATE_OWNER_TOKEN)
  @Operation(
    operationId = "updateTemplate",
    summary = "Replace a game template's name, area and routes",
    description = "Games already created from the template keep their own copy and do not change.",
    responses = {
      @ApiResponse(responseCode = "200", description = "The updated template"),
      @ApiResponse(responseCode = "400", description = "Missing name, unusable area, or unknown route"),
      @ApiResponse(responseCode = "401", description = "No owner token"),
      @ApiResponse(responseCode = "403", description = "Not this template's owner token"),
      @ApiResponse(responseCode = "404", description = "No such template")
    }
  )
  public TemplateDTO updateTemplate(
    @PathVariable UUID templateId,
    @Parameter(hidden = true) @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization,
    @RequestBody TemplateRequest request) {
    return templateService.update(templateId, BearerToken.from(authorization).orElse(null), request);
  }

  @DeleteMapping("/{templateId}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @SecurityRequirement(name = GameAuthConfig.TEMPLATE_OWNER_TOKEN)
  @Operation(
    operationId = "deleteTemplate",
    summary = "Delete a game template",
    description = "Games already created from the template are kept.",
    responses = {
      @ApiResponse(responseCode = "204", description = "Deleted"),
      @ApiResponse(responseCode = "401", description = "No owner token"),
      @ApiResponse(responseCode = "403", description = "Not this template's owner token"),
      @ApiResponse(responseCode = "404", description = "No such template")
    }
  )
  public void deleteTemplate(
    @PathVariable UUID templateId,
    @Parameter(hidden = true) @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization) {
    templateService.delete(templateId, BearerToken.from(authorization).orElse(null));
  }
}
