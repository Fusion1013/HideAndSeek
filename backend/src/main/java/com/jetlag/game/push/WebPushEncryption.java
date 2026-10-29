package com.jetlag.game.push;

import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.AlgorithmParameters;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.SecureRandom;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPublicKeySpec;
import java.util.Arrays;

/**
 * Encrypts a push message for one subscription, as RFC 8291 (Message Encryption for Web Push) asks: a new P-256
 * key pair and salt for each message, the content encoded as a single aes128gcm record (RFC 8188).
 */
final class WebPushEncryption {

  private static final SecureRandom RANDOM = new SecureRandom();
  /** The record size written in the header; one record holds the whole message, which is far smaller. */
  private static final int RECORD_SIZE = 4096;
  private static final int SALT_BYTES = 16;
  /** Uncompressed P-256 point: 0x04, then x and y. */
  static final int PUBLIC_KEY_BYTES = 65;

  private WebPushEncryption() {
  }

  /**
   * The message body to post to the subscription's endpoint, with {@code Content-Encoding: aes128gcm}.
   *
   * @param userAgentPublicKey the subscription's p256dh key, as an uncompressed point
   * @param authSecret         the subscription's auth secret
   */
  static byte[] encrypt(byte[] plaintext, byte[] userAgentPublicKey, byte[] authSecret) {
    byte[] salt = new byte[SALT_BYTES];
    RANDOM.nextBytes(salt);
    return encrypt(plaintext, userAgentPublicKey, authSecret, newKeyPair(), salt);
  }

  /** With the sender's key pair and the salt given, for the RFC's test vector. */
  static byte[] encrypt(byte[] plaintext, byte[] userAgentPublicKey, byte[] authSecret, KeyPair sender, byte[] salt) {
    try {
      byte[] senderPublicKey = rawPublicKey((ECPublicKey) sender.getPublic());
      KeyAgreement agreement = KeyAgreement.getInstance("ECDH");
      agreement.init(sender.getPrivate());
      agreement.doPhase(publicKey(userAgentPublicKey), true);
      byte[] sharedSecret = agreement.generateSecret();

      byte[] keyInfo = concat("WebPush: info\0".getBytes(StandardCharsets.US_ASCII), userAgentPublicKey, senderPublicKey);
      byte[] inputKey = hkdf(authSecret, sharedSecret, keyInfo, 32);
      byte[] contentKey = hkdf(salt, inputKey, "Content-Encoding: aes128gcm\0".getBytes(StandardCharsets.US_ASCII), 16);
      byte[] nonce = hkdf(salt, inputKey, "Content-Encoding: nonce\0".getBytes(StandardCharsets.US_ASCII), 12);

      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(contentKey, "AES"), new GCMParameterSpec(128, nonce));
      // 0x02 ends the last (here the only) record, with no padding after it
      byte[] ciphertext = cipher.doFinal(concat(plaintext, new byte[]{2}));

      return ByteBuffer.allocate(SALT_BYTES + 4 + 1 + senderPublicKey.length + ciphertext.length)
        .put(salt).putInt(RECORD_SIZE).put((byte) senderPublicKey.length).put(senderPublicKey).put(ciphertext)
        .array();
    } catch (GeneralSecurityException e) {
      throw new IllegalArgumentException("The push message could not be encrypted for this subscription", e);
    }
  }

  static KeyPair newKeyPair() {
    try {
      KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
      generator.initialize(new ECGenParameterSpec("secp256r1"), RANDOM);
      return generator.generateKeyPair();
    } catch (GeneralSecurityException e) {
      throw new IllegalStateException("P-256 is required of every JVM", e);
    }
  }

  /** A P-256 public key from its uncompressed point. */
  static ECPublicKey publicKey(byte[] raw) throws GeneralSecurityException {
    if (raw.length != PUBLIC_KEY_BYTES || raw[0] != 4) {
      throw new GeneralSecurityException("Not an uncompressed P-256 point");
    }
    ECPoint point = new ECPoint(new BigInteger(1, Arrays.copyOfRange(raw, 1, 33)),
      new BigInteger(1, Arrays.copyOfRange(raw, 33, 65)));
    return (ECPublicKey) KeyFactory.getInstance("EC").generatePublic(new ECPublicKeySpec(point, p256()));
  }

  /** A P-256 public key as its uncompressed point. */
  static byte[] rawPublicKey(ECPublicKey key) {
    byte[] raw = new byte[PUBLIC_KEY_BYTES];
    raw[0] = 4;
    copyUnsigned(key.getW().getAffineX(), raw, 1);
    copyUnsigned(key.getW().getAffineY(), raw, 33);
    return raw;
  }

  static ECParameterSpec p256() throws GeneralSecurityException {
    AlgorithmParameters parameters = AlgorithmParameters.getInstance("EC");
    parameters.init(new ECGenParameterSpec("secp256r1"));
    return parameters.getParameterSpec(ECParameterSpec.class);
  }

  /** A coordinate as exactly 32 big-endian bytes, without BigInteger's sign byte or with its leading zeros. */
  private static void copyUnsigned(BigInteger value, byte[] target, int offset) {
    byte[] bytes = value.toByteArray();
    int length = Math.min(bytes.length, 32);
    System.arraycopy(bytes, bytes.length - length, target, offset + 32 - length, length);
  }

  /** HKDF-SHA256 (RFC 5869) for outputs of at most one block, which is all Web Push needs. */
  private static byte[] hkdf(byte[] salt, byte[] inputKey, byte[] info, int length) throws GeneralSecurityException {
    byte[] pseudoRandomKey = hmac(salt, inputKey);
    return Arrays.copyOf(hmac(pseudoRandomKey, concat(info, new byte[]{1})), length);
  }

  private static byte[] hmac(byte[] key, byte[] data) throws GeneralSecurityException {
    Mac mac = Mac.getInstance("HmacSHA256");
    mac.init(new SecretKeySpec(key, "HmacSHA256"));
    return mac.doFinal(data);
  }

  private static byte[] concat(byte[]... parts) {
    ByteBuffer buffer = ByteBuffer.allocate(Arrays.stream(parts).mapToInt(part -> part.length).sum());
    for (byte[] part : parts) buffer.put(part);
    return buffer.array();
  }
}
