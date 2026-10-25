package com.jetlag.game.auth;

import com.jetlag.game.session.GamePlayerEntity;
import com.jetlag.game.session.GamePlayerRepository;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.HandlerMapping;

import java.util.Map;

/** Supplies {@link CurrentPlayer} parameters from the request's bearer token. */
@Component
public class CurrentPlayerArgumentResolver implements HandlerMethodArgumentResolver {

  private final GamePlayerRepository playerRepository;

  public CurrentPlayerArgumentResolver(GamePlayerRepository playerRepository) {
    this.playerRepository = playerRepository;
  }

  @Override
  public boolean supportsParameter(MethodParameter parameter) {
    return parameter.hasParameterAnnotation(CurrentPlayer.class)
      && GamePlayerEntity.class.isAssignableFrom(parameter.getParameterType());
  }

  @Override
  public GamePlayerEntity resolveArgument(MethodParameter parameter, ModelAndViewContainer mavContainer,
                                          NativeWebRequest webRequest, WebDataBinderFactory binderFactory) {
    GamePlayerEntity player = BearerToken.from(webRequest.getHeader(HttpHeaders.AUTHORIZATION))
      .map(AccessTokens::hash)
      .flatMap(playerRepository::findByTokenHash)
      .orElseThrow(InvalidTokenException::new);

    String pathGameId = pathVariable(webRequest, "gameId");
    if (pathGameId != null && !pathGameId.equals(player.getGame().getId().toString())) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "This token belongs to another game");
    }
    return player;
  }

  @SuppressWarnings("unchecked")
  private static String pathVariable(NativeWebRequest webRequest, String name) {
    Object variables = webRequest.getAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE,
      RequestAttributes.SCOPE_REQUEST);
    return variables instanceof Map<?, ?> map ? ((Map<String, String>) map).get(name) : null;
  }
}
