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
  /** An answer is old news to the seekers if it reaches them later than this. */
  private static final Duration ANSWER_NOTICE_TTL = Duration.ofMinutes(10);
  static final int MIN_DISTANCE_METERS = 100;
  static final int MAX_DISTANCE_METERS = 500_000;
  /** Category IDs are the frontend's (map layer IDs and game_station); only their form is checked. */
  private static final Pattern CATEGORY = Pattern.compile("[a-z0-9_]{1,40}");

  private final GameQuestionRepository questionRepository;
  private final GameQuestionPhotoRepository photoRepository;
  private final GameRepository gameRepository;
  private final GamePlayerRepository playerRepository;
  private final NearestPlaces nearestPlaces;
  private final GameEventLog eventLog;
  private final GameNotifications notifications;
  private final Clock clock;

  public QuestionService(GameQuestionRepository questionRepository, GameQuestionPhotoRepository photoRepository,
                         GameRepository gameRepository, GamePlayerRepository playerRepository,
                         NearestPlaces nearestPlaces, GameEventLog eventLog, GameNotifications notifications,
                         Clock clock) {
    this.questionRepository = questionRepository;
    this.photoRepository = photoRepository;
    this.gameRepository = gameRepository;
    this.playerRepository = playerRepository;
    this.nearestPlaces = nearestPlaces;
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
    GameEntity game = lock(asker);
    GamePlayerEntity seeker = playerRepository.findById(asker.getId()).orElseThrow();
    requireMayAsk(game, seeker);
    QuestionParams params = paramsOf(game, seeker, request);
    QuestionType type = request.type();
    Duration answerTime = game.getSettings().rules(type).answerTime();
    Instant now = clock.instant();
    GameQuestionEntity question = questionRepository.saveAndFlush(new GameQuestionEntity(game.getId(), type,
      params, seeker.getId(), now, now.plus(answerTime)));
    tell(game, EventAudience.HIDERS, "A " + label(type) + " question is waiting: answer within "
      + answerTime.toMinutes() + " min.", answerTime);
    return record(question);
  }

  /** What a question would be about if the seeker asked it now. Nothing is kept, and nobody else hears of it. */
  @Transactional(readOnly = true)
  public QuestionParams preview(GamePlayerEntity asker, QuestionRequests.AskRequest request) {
    GameEntity game = gameRepository.findById(asker.getGame().getId())
      .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Game not found"));
    GamePlayerEntity seeker = playerRepository.findById(asker.getId()).orElseThrow();
    requireMayAsk(game, seeker);
    return paramsOf(game, seeker, request);
  }

  /** A hider answers the waiting question, before its deadline. */
  @Transactional
  public QuestionDTO answer(GamePlayerEntity answerer, UUID questionId, QuestionRequests.AnswerRequest request) {
    GameEntity game = lock(answerer);
    GameQuestionEntity question = answerable(game, answerer, questionId);
    return answered(game, question, located(question, validAnswer(question.getType(), request)), answerer);
  }

  /** A hider answers the waiting photo question, on the same terms, with a picture every player may then see. */
  @Transactional
  public QuestionDTO answerWithPhoto(GamePlayerEntity answerer, UUID questionId, byte[] upload) {
    // Before the lock: the rest of the game need not wait for an image to be made
    byte[] image = QuestionPhotos.withoutMetadata(upload);
    GameEntity game = lock(answerer);
    GameQuestionEntity question = answerable(game, answerer, questionId);
    if (question.getType() != QuestionType.PHOTO) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This question is not answered with a photo");
    }
    photoRepository.save(new GameQuestionPhotoEntity(question.getId(), image));
    return answered(game, question, new QuestionAnswer(QuestionAnswer.PHOTO, null, null), answerer);
  }

  /** The picture that answered a question of the game, as a JPEG. */
  @Transactional(readOnly = true)
  public byte[] photo(UUID gameId, UUID questionId) {
    return questionRepository.findById(questionId)
      .filter(question -> question.getGameId().equals(gameId))
      .flatMap(question -> photoRepository.findById(question.getId()))
      .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such photo in this game"))
      .getImage();
  }

  /** The question, if this player may answer it now. */
  private GameQuestionEntity answerable(GameEntity game, GamePlayerEntity answerer, UUID questionId) {
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
    if (!clock.instant().isBefore(question.getDeadlineAt())) {
      // Expired by the next scheduled run
      throw new ResponseStatusException(HttpStatus.CONFLICT, "The time to answer this question is up");
    }
    return question;
  }

  private QuestionDTO answered(GameEntity game, GameQuestionEntity question, QuestionAnswer answer, GamePlayerEntity hider) {
    question.answer(answer, hider.getId(), clock.instant());
    questionRepository.saveAndFlush(question);
    tell(game, EventAudience.SEEKERS, "The hiders answered your " + label(question.getType()) + " question: "
      + answerText(answer), ANSWER_NOTICE_TTL);
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

  private void requireMayAsk(GameEntity game, GamePlayerEntity seeker) {
    if (seeker.getRole() != PlayerRole.SEEKER) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only seekers ask questions");
    }
    if (game.getStatus() != GameStatus.SEEKING) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "Questions can only be asked while seeking");
    }
    if (questionRepository.findByGameIdAndStatus(game.getId(), GameQuestionEntity.Status.PENDING).isPresent()) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "Wait for the answer to the last question first");
    }
  }

  /** A thermometer's distance is how far the seekers moved, which is not theirs to choose from. */
  private static void requireAllowed(QuestionRules rules, QuestionType type, String category, Integer distance) {
    if (rules.disabled()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This game has no " + label(type) + " questions");
    }
    if (category != null && rules.disabledCategories().contains(category)) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This game does not ask about that category of place");
    }
    if (type.needsDistance() && rules.disabledDistances().contains(distance)) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This game does not use that distance");
    }
  }

  /** The request, checked, with what is true of it at this moment: where the seeker is, and what is nearest them. */
  private QuestionParams paramsOf(GameEntity game, GamePlayerEntity seeker, QuestionRequests.AskRequest request) {
    QuestionType type = request.type();
    if (type == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a kind of question");
    String category = type.needsCategory() ? validCategory(request.category()) : null;
    QuestionParams.Position start = type.needsPath() ? validPosition(request.start()) : null;
    QuestionParams.Position end = type.needsPath() ? validPosition(request.end()) : null;
    Integer distance = type.needsPath() ? Integer.valueOf(validDistance(start.metersTo(end)))
      : type.needsDistance() ? Integer.valueOf(validDistance(request.distanceMeters())) : null;
    requireAllowed(game.getSettings().rules(type), type, category, distance);

    QuestionParams.Position origin = seeker.getLastLocation() == null ? null
      : new QuestionParams.Position(seeker.getLastLocation().getX(), seeker.getLastLocation().getY());
    QuestionParams.NearestPlace nearest = type.comparesNearest() && origin != null
      ? nearestPlaces.nearest(game.getId(), category, origin).orElse(null) : null;
    if (type == QuestionType.MEASURING && nearest != null) {
      nearest = nearest.withReach(nearestPlaces.reach(game.getId(), category, nearest.distanceMeters()));
    }
    return new QuestionParams(category, distance, origin, start, end, nearest);
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
      case QuestionAnswer.PHOTO -> "see the photo";
      default -> answer.choice().charAt(0) + answer.choice().substring(1).toLowerCase(Locale.ROOT);
    };
  }

  private GameEntity lock(GamePlayerEntity player) {
    return gameRepository.findForUpdate(player.getGame().getId())
      .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Game not found"));
  }

  public static String validCategory(String category) {
    if (category == null || !CATEGORY.matcher(category).matches()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a category of place");
    }
    return category;
  }

  public static int validDistance(Integer distance) {
    if (distance == null || distance < MIN_DISTANCE_METERS || distance > MAX_DISTANCE_METERS) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
        "The distance must be " + MIN_DISTANCE_METERS + " m to " + MAX_DISTANCE_METERS / 1000 + " km");
    }
    return distance;
  }

  private static QuestionParams.Position validPosition(QuestionParams.Position position) {
    if (position == null || Math.abs(position.longitude()) > 180 || Math.abs(position.latitude()) > 90) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose where the seekers started and stopped");
    }
    return position;
  }

  /** A place named in an answer, found on the map if it can be: the name is the hiders' own words. */
  private QuestionAnswer located(GameQuestionEntity question, QuestionAnswer answer) {
    QuestionParams params = question.getParams();
    if (!answer.choice().equals(QuestionAnswer.PLACE) || params.origin() == null) return answer;
    return nearestPlaces.named(question.getGameId(), params.category(), params.origin(), answer.text())
      .map(place -> new QuestionAnswer(answer.choice(), answer.text(),
        new QuestionParams.Position(place.longitude(), place.latitude())))
      .orElse(answer);
  }

  private static QuestionAnswer validAnswer(QuestionType type, QuestionRequests.AnswerRequest request) {
    String choice = request.choice();
    // A photo comes with its picture (see answerWithPhoto), and is not an answer without one
    if (choice == null || choice.equals(QuestionAnswer.PHOTO) || !type.choices().contains(choice)) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "That is not an answer to this kind of question");
    }
    if (!choice.equals(QuestionAnswer.PLACE)) return new QuestionAnswer(choice, null, null);
    String text = request.text() == null ? "" : request.text().strip();
    if (text.isEmpty() || text.length() > QuestionAnswer.MAX_TEXT_LENGTH) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
        "Name the place, in at most " + QuestionAnswer.MAX_TEXT_LENGTH + " characters");
    }
    return new QuestionAnswer(choice, text, null);
  }
}
