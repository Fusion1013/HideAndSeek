package com.jetlag.game.session;

import com.jetlag.game.question.QuestionDTO;
import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * The game as one player asked for it: the shared state, which player they are, the server's time, and what only
 * their role may see.
 */
public record PlayerGameDTO(
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) GameDTO game,
  @Schema(description = "The player whose token was sent", requiredMode = Schema.RequiredMode.REQUIRED)
  UUID myPlayerId,
  @Schema(description = "The server's clock, for counting down without trusting the device's",
    requiredMode = Schema.RequiredMode.REQUIRED)
  Instant serverTime,
  @Schema(description = "Hiders only: their station, once chosen. Always null for anyone else.")
  HidingStationDTO hidingStation,
  @Schema(description = "Hiders only: where each seeker was last seen. Always empty for anyone else.",
    requiredMode = Schema.RequiredMode.REQUIRED)
  List<SeekerLocationDTO> seekerLocations,
  @Schema(description = "The seekers' questions and the hiders' answers, oldest first",
    requiredMode = Schema.RequiredMode.REQUIRED)
  List<QuestionDTO> questions
) {
}
