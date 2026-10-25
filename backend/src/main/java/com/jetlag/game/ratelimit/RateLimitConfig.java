package com.jetlag.game.ratelimit;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.time.Clock;
import java.time.Duration;

/**
 * Limits how often one client may join games, create games and create templates. Joining is limited so invite
 * codes cannot be guessed at speed; creating, so a client cannot fill the database.
 * <p>
 * The client is its IP address. Behind the proxies (Caddy, then nginx) that is taken from X-Forwarded-For, which
 * Tomcat only trusts from private network addresses (server.forward-headers-strategy), so a client cannot pass
 * itself off as another.
 */
@Configuration
public class RateLimitConfig implements WebMvcConfigurer {

  private final RateLimiter limiter;
  private final int joinPerMinute;
  private final int createGamePerMinute;
  private final int createTemplatePerMinute;

  public RateLimitConfig(Clock clock,
                         @Value("${game.rate-limits.join-per-minute:10}") int joinPerMinute,
                         @Value("${game.rate-limits.create-game-per-minute:5}") int createGamePerMinute,
                         @Value("${game.rate-limits.create-template-per-minute:10}") int createTemplatePerMinute) {
    this.limiter = new RateLimiter(clock);
    this.joinPerMinute = joinPerMinute;
    this.createGamePerMinute = createGamePerMinute;
    this.createTemplatePerMinute = createTemplatePerMinute;
  }

  @Override
  public void addInterceptors(InterceptorRegistry registry) {
    registry.addInterceptor(limit("join", "POST", joinPerMinute)).addPathPatterns("/api/games/join");
    registry.addInterceptor(limit("create-game", "POST", createGamePerMinute)).addPathPatterns("/api/games");
    registry.addInterceptor(limit("create-template", "POST", createTemplatePerMinute)).addPathPatterns("/api/templates");
  }

  private HandlerInterceptor limit(String name, String method, int perMinute) {
    return new HandlerInterceptor() {
      @Override
      public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (!method.equals(request.getMethod())) return true;
        Duration wait = limiter.acquire(name + ':' + request.getRemoteAddr(), perMinute);
        if (!wait.isZero()) throw new TooManyRequestsException(wait);
        return true;
      }
    };
  }
}
