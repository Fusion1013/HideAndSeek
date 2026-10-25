package com.jetlag.game.session;

import java.security.SecureRandom;
import java.util.Locale;

/**
 * The codes players type to join a game: six characters, without the ones that are easy to mix up when read
 * aloud or off a screen (0/O, 1/I/L). About 900 million codes, so a guess rarely hits a game.
 */
final class InviteCodes {

  static final String ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  static final int LENGTH = 6;

  private static final SecureRandom RANDOM = new SecureRandom();

  private InviteCodes() {
  }

  static String generate() {
    StringBuilder code = new StringBuilder(LENGTH);
    for (int i = 0; i < LENGTH; i++) {
      code.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
    }
    return code.toString();
  }

  /** The code as typed, in the stored form: upper case, without spaces or dashes ("abc-23 4" is "ABC234"). */
  static String normalize(String typed) {
    return typed == null ? "" : typed.replaceAll("[\\s-]", "").toUpperCase(Locale.ROOT);
  }
}
