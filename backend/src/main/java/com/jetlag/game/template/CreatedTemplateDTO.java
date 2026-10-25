package com.jetlag.game.template;

import io.swagger.v3.oas.annotations.media.Schema;

/** A new template and the token that edits it. The token is only ever sent this once. */
public record CreatedTemplateDTO(
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) TemplateDTO template,
  @Schema(description = "Send as a bearer token to edit or delete the template", requiredMode = Schema.RequiredMode.REQUIRED)
  String ownerToken
) {
}
