package com.jetlag.game.session;

/** A game's phase, in order. Players join in the lobby; only the hiders move during HIDING. */
public enum GameStatus {
  LOBBY,
  HIDING,
  SEEKING,
  FINISHED
}
