package com.jetlag.game.session;

import com.jetlag.game.auth.PlayerCookie;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.UUID;

import static org.hamcrest.Matchers.allOf;
import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class PlayerAccessControllerTest {

  private final UUID gameId = UUID.randomUUID();
  private final UUID playerId = UUID.randomUUID();
  private final PlayerAccessService service = mock(PlayerAccessService.class);
  private MockMvc mvc;

  @BeforeEach
  void setUp() {
    mvc = MockMvcBuilders.standaloneSetup(new PlayerAccessController(service)).build();
  }

  @Test
  void restoresFromTheCookieAndKeepsTheNewTokenInIt() throws Exception {
    when(service.restore(gameId, "old-token")).thenReturn(new JoinedGameDTO(gameId, playerId, "new-token"));

    mvc.perform(post("/api/games/{gameId}/session", gameId).cookie(new Cookie(PlayerCookie.NAME, "old-token")))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.playerToken").value("new-token"))
      .andExpect(header().string(HttpHeaders.SET_COOKIE, allOf(
        containsString(PlayerCookie.NAME + "=new-token"),
        containsString("Path=/api/games/" + gameId),
        containsString("HttpOnly"),
        containsString("Secure"),
        containsString("SameSite=Strict"))));
  }

  @Test
  void aBrowserWithoutTheCookieHasNoPlaceToRestore() throws Exception {
    mvc.perform(post("/api/games/{gameId}/session", gameId))
      .andExpect(status().isUnauthorized());
    verifyNoInteractions(service);
  }

  @Test
  void rejoiningWithACodeSetsTheCookieToo() throws Exception {
    when(service.rejoin(any(), any())).thenReturn(new JoinedGameDTO(gameId, playerId, "new-token"));

    mvc.perform(post("/api/games/{gameId}/rejoin", gameId)
        .contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"abc\"}"))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.playerId").value(playerId.toString()))
      .andExpect(header().string(HttpHeaders.SET_COOKIE, containsString(PlayerCookie.NAME + "=new-token")));
  }
}
