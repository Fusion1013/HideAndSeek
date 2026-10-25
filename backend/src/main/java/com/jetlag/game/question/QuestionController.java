package com.jetlag.game.question;

import com.jetlag.game.auth.CurrentPlayer;
import com.jetlag.game.auth.GameAuthConfig;
import com.jetlag.game.session.GamePlayerEntity;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/** The seekers' questions and the hiders' answers. */
@RestController
// Declared, so the API document says JSON rather than */*; the generated client reads */* responses as blobs
@RequestMapping(value = "/api/games/{gameId}/questions", produces = MediaType.APPLICATION_JSON_VALUE)
@SecurityRequirement(name = GameAuthConfig.PLAYER_TOKEN)
public class QuestionController {

  private final QuestionService questionService;

  public QuestionController(QuestionService questionService) {
    this.questionService = questionService;
  }

  @GetMapping
  @Operation(
    operationId = "getQuestions",
    summary = "Get the game's questions and answers",
    responses = @ApiResponse(responseCode = "200", description = "The questions, oldest first")
  )
  public List<QuestionDTO> getQuestions(@PathVariable UUID gameId, @CurrentPlayer GamePlayerEntity player) {
    return questionService.list(player.getGame().getId());
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  @Operation(
    operationId = "askQuestion",
    summary = "Ask the hiders a question",
    description = "Seekers only, while seeking, one question at a time. The hiders have 5 minutes to answer.",
    responses = {
      @ApiResponse(responseCode = "201", description = "The question"),
      @ApiResponse(responseCode = "400", description = "Missing or unusable category or distance"),
      @ApiResponse(responseCode = "403", description = "Not a seeker"),
      @ApiResponse(responseCode = "409", description = "Not seeking, or another question waits for its answer")
    }
  )
  public QuestionDTO askQuestion(@PathVariable UUID gameId, @CurrentPlayer GamePlayerEntity player,
                                 @RequestBody QuestionRequests.AskRequest request) {
    return questionService.ask(player, request);
  }

  @PutMapping("/{questionId}/answer")
  @Operation(
    operationId = "answerQuestion",
    summary = "Answer the waiting question",
    description = "Hiders only, before the deadline.",
    responses = {
      @ApiResponse(responseCode = "200", description = "The answered question"),
      @ApiResponse(responseCode = "400", description = "Not an answer this kind of question allows"),
      @ApiResponse(responseCode = "403", description = "Not a hider"),
      @ApiResponse(responseCode = "404", description = "No such question in this game"),
      @ApiResponse(responseCode = "409", description = "Already answered, or the time is up")
    }
  )
  public QuestionDTO answerQuestion(@PathVariable UUID gameId, @PathVariable UUID questionId,
                                    @CurrentPlayer GamePlayerEntity player,
                                    @RequestBody QuestionRequests.AnswerRequest request) {
    return questionService.answer(player, questionId, request);
  }
}
