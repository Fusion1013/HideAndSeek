package com.jetlag.game.question;

import com.jetlag.game.auth.CurrentPlayer;
import com.jetlag.game.auth.GameAuthConfig;
import com.jetlag.game.session.GamePlayerEntity;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.Duration;
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
    description = "Seekers only, while seeking, one question at a time. The game sets how long the hiders have to "
      + "answer each kind of question, 5 minutes unless it says otherwise.",
    responses = {
      @ApiResponse(responseCode = "201", description = "The question"),
      @ApiResponse(responseCode = "400", description = "Missing or unusable category or distance, or one the game rules out"),
      @ApiResponse(responseCode = "403", description = "Not a seeker"),
      @ApiResponse(responseCode = "409", description = "Not seeking, or another question waits for its answer")
    }
  )
  public QuestionDTO askQuestion(@PathVariable UUID gameId, @CurrentPlayer GamePlayerEntity player,
                                 @RequestBody QuestionRequests.AskRequest request) {
    return questionService.ask(player, request);
  }

  @PostMapping("/preview")
  @Operation(
    operationId = "previewQuestion",
    summary = "See what a question would be about",
    description = "As asking, for the seekers choosing one, but nothing is kept and nobody is told.",
    responses = {
      @ApiResponse(responseCode = "200", description = "What the question would be about, if asked now"),
      @ApiResponse(responseCode = "400", description = "Missing or unusable category or distance, or one the game rules out"),
      @ApiResponse(responseCode = "403", description = "Not a seeker"),
      @ApiResponse(responseCode = "409", description = "Not seeking, or another question waits for its answer")
    }
  )
  public QuestionParams previewQuestion(@PathVariable UUID gameId, @CurrentPlayer GamePlayerEntity player,
                                        @RequestBody QuestionRequests.AskRequest request) {
    return questionService.preview(player, request);
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

  @PostMapping(value = "/{questionId}/photo", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  @Operation(
    operationId = "answerQuestionWithPhoto",
    summary = "Answer the waiting photo question with a picture",
    description = "Hiders only, before the deadline. What is kept is a JPEG of the picture, without its metadata.",
    responses = {
      @ApiResponse(responseCode = "200", description = "The answered question"),
      @ApiResponse(responseCode = "400", description = "Not a picture that can be read, or not a photo question"),
      @ApiResponse(responseCode = "403", description = "Not a hider"),
      @ApiResponse(responseCode = "404", description = "No such question in this game"),
      @ApiResponse(responseCode = "409", description = "Already answered, or the time is up"),
      @ApiResponse(responseCode = "413", description = "Larger than a picture may be")
    }
  )
  public QuestionDTO answerQuestionWithPhoto(@PathVariable UUID gameId, @PathVariable UUID questionId,
                                             @CurrentPlayer GamePlayerEntity player,
                                             @RequestPart("photo") MultipartFile photo) throws IOException {
    return questionService.answerWithPhoto(player, questionId, photo.getBytes());
  }

  @GetMapping(value = "/{questionId}/photo", produces = MediaType.IMAGE_JPEG_VALUE)
  @Operation(
    operationId = "getQuestionPhoto",
    summary = "Get the picture that answered a photo question",
    responses = {
      // As binary, or the generated client would take the picture for a string
      @ApiResponse(responseCode = "200", description = "The picture", content = @Content(
        mediaType = MediaType.IMAGE_JPEG_VALUE, schema = @Schema(type = "string", format = "binary"))),
      @ApiResponse(responseCode = "404", description = "No such photo in this game")
    }
  )
  public ResponseEntity<byte[]> getQuestionPhoto(@PathVariable UUID gameId, @PathVariable UUID questionId,
                                                 @CurrentPlayer GamePlayerEntity player) {
    // An answer never changes
    return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofDays(30)).cachePrivate().immutable())
      .body(questionService.photo(player.getGame().getId(), questionId));
  }
}
