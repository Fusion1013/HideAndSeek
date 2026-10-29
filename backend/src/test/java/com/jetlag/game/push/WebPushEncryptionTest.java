package com.jetlag.game.push;

import org.junit.jupiter.api.Test;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECPrivateKeySpec;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;

class WebPushEncryptionTest {

  private static final Base64.Decoder BASE64 = Base64.getUrlDecoder();

  /** RFC 8291, appendix A. */
  @Test
  void encryptsTheRfcExample() throws Exception {
    byte[] senderPublic = BASE64.decode(
      "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8");
    byte[] senderPrivate = BASE64.decode("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw");
    KeyPair sender = new KeyPair(WebPushEncryption.publicKey(senderPublic), KeyFactory.getInstance("EC")
      .generatePrivate(new ECPrivateKeySpec(new BigInteger(1, senderPrivate), WebPushEncryption.p256())));

    byte[] message = WebPushEncryption.encrypt(
      "When I grow up, I want to be a watermelon".getBytes(StandardCharsets.UTF_8),
      BASE64.decode("BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4"),
      BASE64.decode("BTBZMqHH6r4Tts7J_aSIgg"),
      sender,
      BASE64.decode("DGv6ra1nlYgDCS1FRnbzlw"));

    assertThat(Base64.getUrlEncoder().withoutPadding().encodeToString(message)).isEqualTo(
      "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru"
        + "3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN");
  }

  @Test
  void writesPublicKeysAsUncompressedPoints() throws Exception {
    ECPublicKey key = (ECPublicKey) WebPushEncryption.newKeyPair().getPublic();
    byte[] raw = WebPushEncryption.rawPublicKey(key);

    assertThat(raw).hasSize(65).startsWith(4);
    assertThat(WebPushEncryption.publicKey(raw).getW()).isEqualTo(key.getW());
  }
}
