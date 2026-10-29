package com.jetlag.game.question;

import com.jetlag.game.events.EventAudience;
import com.jetlag.game.events.GameEventLog;
import com.jetlag.game.push.GameNotifications;
import com.jetlag.game.push.GameNotifications.Notification;
import com.jetlag.game.session.GameEntity;
import com.jetlag.game.session.GamePlayerEntity;
import com.jetlag.game.session.GamePlayerRepository;
import com.jetlag.game.session.GameRepository;
import com.jetlag.game.session.GameStatus;
import com.jetlag.game.session.PlayerRole;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * The seekers' questions: asked one at a time while seeking, answered by the hiders before the deadline, expired
 * when it passes. Every player sees the questions and answers; each change is a {@value #QUESTION_EVENT} event.
 */
@Service
public class QuestionService {

  /** A question, new or changed, as a {@link QuestionDTO}. */
  public static final String QUESTION_EVENT = "question";
  static final Duration ANSWER_TIME = Duration.ofMinutes(5);
  /** An answer is old news to the seekers if it reaches them later than this. */
  private static final Duration ANSWER_NOTICE_TTL = Duration.ofMinutes(10);
  static final int MIN_DISTANCE_METERS = 100;
  static final int MAX_DISTANCE_METERS = 500_000;
  /** Category IDs are the frontend's (map layer IDs and game_station); only their form is checked. */
  private static final Pattern CATEGORY = Pattern.compile("[a-z0-9_]{1,40}");

  private final GameQuestionRepository questionRepository;
  private final GameRepository gameRepository;
  private final GamePlayerRepository playerRepository;
  private final GameEventLog eventLog;
  private final GameNotifications notifications;
  private final Clock clock;

  public QuestionService(GameQuestionRepository questionRepository, GameRepository gameRepository,
                         GamePlayerRepository playerRepository, GameEventLog eventLog,
                         GameNotifications notifications, Clock clock) {
    this.questionRepository = questionRepository;
    this.gameRepository = gameRepository;
    this.playerRepository = playerRepository;
    this.eventLog = eventLog;
    this.notifications = notifications;
    this.clock = clock;
  }

  /** The game's questions, oldest first. */
  @Transactional(readOnly = true)
  public List<QuestionDTO> list(UUID gameId) {
    return questionRepository.findByGameIdOrderByAskedAt(gameId).stream().map(QuestionDTO::from).toList();
  }

  /** A seeker asks, while seeking and when no other question waits for its answer. */
  @Transactional
  public QuestionDTO ask(GamePlayerEntity asker, QuestionRequests.AskRequest request) {
    QuestionType type = request.type();
    if (type == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a kind of question");
    String category = type.needsCategory() ? validCategory(request.category()) : null;
    Integer distance = type.needsDistance() ? validDistance(request.distanceMeters()) : null;

    GameEntity game = lock(asker);
    GamePlayerEntity seeker = playerRepository.findById(asker.getId()).orElseThrow();
    if (seeker.getRole() != PlayerRole.SEEKER) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only seekers ask questions");
    }
    if (game.getStatus() != GameStatus.SEEKING) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "Questions can only be asked while seeking");
    }
    if (questionRepository.findByGameIdAndStatus(game.getId(), GameQuestionEntity.Status.PENDING).isPresent()) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "Wait for the answer to the last question first");
    }

    QuestionParams.Position origin = seeker.getLastLocation() == null ? null
      : new QuestionParams.Position(seeker.getLastLocation().getX(), seeker.getLastLocation().getY());
    Instant now = clock.instant();
    GameQuestionEntity question = questionRepository.saveAndFlush(new GameQuestionEntity(game.getId(), type,
      new QuestionParams(category, distance, origin), seeker.getId(), now, now.plus(ANSWER_TIME)));
    tell(game, EventAudience.HIDERS, "A " + label(type) + " question is waiting: answer within "
      + ANSWER_TIME.toMinutes() + " min.", ANSWER_TIME);
    return record(question);
  }

  /** A hider answers the waiting question, before its deadline. */
  @Transactional
  public QuestionDTO answer(GamePlayerEntity answerer, UUID questionId, QuestionRequests.AnswerRequest request) {
    GameEntity game = lock(answerer);
    GamePlayerEntity hider = playerRepository.findById(answerer.getId()).orElseThrow();
    if (hider.getRole() != PlayerRole.HIDER) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only hiders answer questions");
    }
    GameQuestionEntity question = questionRepository.findById(questionId)
      .filter(candidate -> candidate.getGameId().equals(game.getId()))
      .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such question in this game"));
    if (question.getStatus() != GameQuestionEntity.Status.PENDING) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "This question has already been answered or has expired");
    }
    Instant now = clock.instant();
    if (!now.isBefore(question.getDeadlineAt())) {
      // Expired by the next scheduled run
      throw new ResponseStatusException(HttpStatus.CONFLICT, "The time to answer this question is up");
    }

    question.answer(validAnswer(question.getType(), request), hider.getId(), now);
    questionRepository.saveAndFlush(question);
    tell(game, EventAudience.SEEKERS, "The hiders answered your " + label(question.getType()) + " question: "
      + answerText(question.getAnswer()), ANSWER_NOTICE_TTL);
    return record(question);
  }

  /** Expires every question whose deadline has passed, and tells the players. Run on a schedule. */
  @Transactional
  public void expireOverdue() {
    for (GameQuestionEntity question : questionRepository.findByStatusAndDeadlineAtLessThanEqual(
      GameQuestionEntity.Status.PENDING, clock.instant())) {
      gameRepository.findForUpdate(question.getGameId()).ifPresent(game -> {
        question.expire();
        questionRepository.saveAndFlush(question);
        record(question);
        tell(game, EventAudience.SEEKERS, "The hiders did not answer your " + label(question.getType())
          + " question in time.", ANSWER_NOTICE_TTL);
      });
    }
  }

  private QuestionDTO record(GameQuestionEntity question) {
    QuestionDTO dto = QuestionDTO.from(question);
    eventLog.record(question.getGameId(), QUESTION_EVENT, EventAudience.ALL, dto);
    return dto;
  }

  /** Tells the audience on their devices, in place of the last notice about a question. */
  private void tell(GameEntity game, EventAudience audience, String body, Duration ttl) {
    notifications.send(new Notification(game.getId(), audience, null, game.getName(), body, "question", ttl));
  }

  /** "radar", for "a radar question". */
  private static String label(QuestionType type) {
    return type.name().toLowerCase(Locale.ROOT);
  }

  /** "Yes", "Closer", or the place named; as the frontend words them. */
  private static String answerText(QuestionAnswer answer) {
    return switch (answer.choice()) {
      case QuestionAnswer.PLACE -> answer.text();
      case QuestionAnswer.NONE -> "None within the distance";
      default -> answer.choice().charAt(0) + answer.choice().substring(1).toLowerCase(Locale.ROOT);
    };
  }

  private GameEntity lock(GamePlayerEntity player) {
    return gameRepository.findForUpdate(player.getGame().getId())
      .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Game not found"));
  }

  private static String validCategory(String category) {
    if (category == null || !CATEGORY.matcher(category).matches()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a category of place");
    }
    return category;
  }

  private static int validDistance(Integer distance) {
    if (distance == null || distance < MIN_DISTANCE_METERS || distance > MAX_DISTANCE_METERS) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
        "The distance must be " + MIN_DISTANCE_METERS + " m to " + MAX_DISTANCE_METERS / 1000 + " km");
    }
    return distance;
  }

  private static QuestionAnswer validAnswer(QuestionType type, QuestionRequests.AnswerRequest request) {
    String choice = request.choice();
    if (choice == null || !type.choices().contains(choice)) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "That is not an answer to this kind of question");
    }
    if (!choice.equals(QuestionAnswer.PLACE)) return new QuestionAnswer(choice, null);
    String text = request.text() == null ? "" : request.text().strip();
    if (text.isEmpty() || text.length() > QuestionAnswer.MAX_TEXT_LENGTH) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
        "Name the place, in at most " + QuestionAnswer.MAX_TEXT_LENGTH + " characters");
    }
    return new QuestionAnswer(choice, text);
  }
}
