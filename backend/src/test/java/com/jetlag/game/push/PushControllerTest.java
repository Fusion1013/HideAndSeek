package com.jetlag.game.push;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PushControllerTest {

  @ParameterizedTest
  @ValueSource(strings = {
    "https://fcm.googleapis.com/fcm/send/abc:def",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
    "https://wns2-par02p.notify.windows.com/w/?token=BQYAAA",
    "https://web.push.apple.com/QGuQyavXutnMH"
  })
  void acceptsTheBrowsersPushServices(String endpoint) {
    assertThat(PushController.validEndpoint(endpoint)).isEqualTo(endpoint);
  }

  @ParameterizedTest
  @ValueSource(strings = {
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://localhost/push",
    "https://10.0.0.1/push",
    "https://evilgoogleapis.com/push",
    "https://fcm.googleapis.com.evil.example/push",
    "https://fcm.googleapis.com:8443/push",
    "https://user@fcm.googleapis.com/push",
    "not a url"
  })
  void refusesAnyOtherAddress(String endpoint) {
    assertThatThrownBy(() -> PushController.validEndpoint(endpoint)).isInstanceOf(ResponseStatusException.class);
  }
}
