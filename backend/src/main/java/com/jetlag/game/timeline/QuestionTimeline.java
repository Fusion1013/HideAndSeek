package com.jetlag.game.timeline;

import com.jetlag.game.question.GameQuestionEntity;
import com.jetlag.game.question.QuestionDTO;
import com.jetlag.game.question.QuestionService;
import com.jetlag.game.session.GameDTO;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/** Each question: when it was asked, and when it was answered or ran out of time. */
@Component
class QuestionTimeline implements TimelineSource {

  private final QuestionService questionService;

  QuestionTimeline(QuestionService questionService) {
    this.questionService = questionService;
  }

  @Override
  public List<TimelineEventDTO> events(GameDTO game) {
    List<TimelineEventDTO> events = new ArrayList<>();
    for (QuestionDTO question : questionService.list(game.id())) {
      events.add(TimelineEventDTO.of(TimelineEventType.QUESTION_ASKED, question.askedAt(), question.askedBy(), question));
      if (question.status() == GameQuestionEntity.Status.ANSWERED && question.answeredAt() != null) {
        events.add(TimelineEventDTO.of(TimelineEventType.QUESTION_ANSWERED, question.answeredAt(), question.answeredBy(),
          question));
      } else if (question.status() == GameQuestionEntity.Status.EXPIRED) {
        events.add(TimelineEventDTO.of(TimelineEventType.QUESTION_EXPIRED, question.deadlineAt(), null, question));
      }
    }
    return events;
  }
}
