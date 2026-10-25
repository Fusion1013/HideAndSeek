package com.jetlag.game.auth;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class AccessTokensTest {

  @Test
  void issuesUrlSafeTokensThatMatchOnlyTheirOwnHash() {
    AccessTokens.IssuedToken first = AccessTokens.issue();
    AccessTokens.IssuedToken second = AccessTokens.issue();

    assertThat(first.token()).hasSize(43).matches("[A-Za-z0-9_-]+");
    assertThat(first.token()).isNotEqualTo(second.token());
    assertThat(first.hash()).hasSize(32).isEqualTo(AccessTokens.hash(first.token()));

    assertThat(AccessTokens.matches(first.token(), first.hash())).isTrue();
    assertThat(AccessTokens.matches(second.token(), first.hash())).isFalse();
    assertThat(AccessTokens.matches(null, first.hash())).isFalse();
  }

  @Test
  void readsOnlyNonEmptyBearerHeaders() {
    assertThat(BearerToken.from("Bearer abc")).contains("abc");
    assertThat(BearerToken.from("bearer  abc ")).contains("abc");
    assertThat(BearerToken.from("Bearer ")).isEmpty();
    assertThat(BearerToken.from("Basic abc")).isEmpty();
    assertThat(BearerToken.from(null)).isEmpty();
  }
}
