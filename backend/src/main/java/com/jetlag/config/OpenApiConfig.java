package com.jetlag.config;

import io.swagger.v3.oas.models.media.StringSchema;
import org.springdoc.core.utils.SpringDocUtils;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/** Adjustments to the generated API document, which the frontend's client is generated from. */
@Configuration
public class OpenApiConfig {

  static {
    // An event stream is text; without this, SseEmitter's Java fields become a model in the generated client
    SpringDocUtils.getConfig().replaceWithSchema(SseEmitter.class, new StringSchema());
  }
}
