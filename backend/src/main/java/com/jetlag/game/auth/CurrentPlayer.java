package com.jetlag.game.auth;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Marks a {@code GamePlayerEntity} controller parameter: the player whose token came with the request.
 * Without a valid token the request fails with 401. When the path has a {@code {gameId}}, the player must belong
 * to that game, or it fails with 403, so a token from one game cannot be used on another.
 * Endpoints that use it should declare {@code @SecurityRequirement(name = GameAuthConfig.PLAYER_TOKEN)}.
 */
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
public @interface CurrentPlayer {
}
