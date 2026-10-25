package com.jetlag.game.auth;

import com.jetlag.game.session.GameEntity;
import com.jetlag.game.session.GamePlayerEntity;
import com.jetlag.game.session.GamePlayerRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class CurrentPlayerArgumentResolverTest {

  private final UUID gameId = UUID.randomUUID();
  private final AccessTokens.IssuedToken token = AccessTokens.issue();
  private MockMvc mvc;

  @RestController
  static class TestController {
    @GetMapping("/me")
    String me(@CurrentPlayer GamePlayerEntity player) {
      return player.getDisplayName();
    }

    @GetMapping("/games/{gameId}/me")
    String meInGame(@PathVariable String gameId, @CurrentPlayer GamePlayerEntity player) {
      return player.getDisplayName();
    }
  }

  @BeforeEach
  void setUp() {
    GameEntity game = mock(GameEntity.class);
    when(game.getId()).thenReturn(gameId);
    GamePlayerEntity player = new GamePlayerEntity(game, "Ada", true, token.hash());
    ReflectionTestUtils.setField(player, "id", UUID.randomUUID());

    GamePlayerRepository repository = mock(GamePlayerRepository.class);
    when(repository.findByTokenHash(any())).thenReturn(Optional.empty());
    when(repository.findByTokenHash(argThat(hash -> java.util.Arrays.equals(hash, token.hash()))))
      .thenReturn(Optional.of(player));

    mvc = MockMvcBuilders.standaloneSetup(new TestController())
      .setCustomArgumentResolvers(new CurrentPlayerArgumentResolver(repository))
      .build();
  }

  @Test
  void resolvesThePlayerHoldingTheToken() throws Exception {
    mvc.perform(get("/me").header("Authorization", "Bearer " + token.token()))
      .andExpect(status().isOk())
      .andExpect(content().string("Ada"));
  }

  @Test
  void rejectsMissingAndUnknownTokens() throws Exception {
    mvc.perform(get("/me"))
      .andExpect(status().isUnauthorized())
      .andExpect(header().string("WWW-Authenticate", "Bearer"));
    mvc.perform(get("/me").header("Authorization", "Bearer " + AccessTokens.issue().token()))
      .andExpect(status().isUnauthorized());
  }

  @Test
  void acceptsTheTokenOnlyForItsOwnGame() throws Exception {
    mvc.perform(get("/games/{gameId}/me", gameId).header("Authorization", "Bearer " + token.token()))
      .andExpect(status().isOk());
    mvc.perform(get("/games/{gameId}/me", UUID.randomUUID()).header("Authorization", "Bearer " + token.token()))
      .andExpect(status().isForbidden());
  }
}
