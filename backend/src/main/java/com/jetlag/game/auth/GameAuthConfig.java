package com.jetlag.game.auth;

import io.swagger.v3.oas.annotations.enums.SecuritySchemeType;
import io.swagger.v3.oas.annotations.security.SecurityScheme;
import org.springdoc.core.utils.SpringDocUtils;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.List;

/**
 * Registers {@link CurrentPlayer} and describes the tokens in the OpenAPI document, so the generated frontend
 * client sends them as {@code Authorization: Bearer} headers.
 */
@Configuration
@SecurityScheme(name = GameAuthConfig.PLAYER_TOKEN, type = SecuritySchemeType.HTTP, scheme = "bearer")
@SecurityScheme(name = GameAuthConfig.TEMPLATE_OWNER_TOKEN, type = SecuritySchemeType.HTTP, scheme = "bearer")
public class GameAuthConfig implements WebMvcConfigurer {

  public static final String PLAYER_TOKEN = "playerToken";
  public static final String TEMPLATE_OWNER_TOKEN = "templateOwnerToken";

  static {
    // The player comes from the token, not from a request parameter the client fills in
    SpringDocUtils.getConfig().addAnnotationsToIgnore(CurrentPlayer.class);
  }

  private final CurrentPlayerArgumentResolver currentPlayerResolver;

  public GameAuthConfig(CurrentPlayerArgumentResolver currentPlayerResolver) {
    this.currentPlayerResolver = currentPlayerResolver;
  }

  @Override
  public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
    resolvers.add(currentPlayerResolver);
  }
}
