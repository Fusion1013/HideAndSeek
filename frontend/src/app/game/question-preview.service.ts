import { computed, inject, Injectable, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';

import { QuestionControllerService } from '../api/generated';
import type { AskRequest, QuestionDTO } from '../api/generated';
import { GeolocationService } from '../position/geolocation.service';
import { GameSessionService } from './game-session.service';
import { PREVIEW_QUESTION_ID } from './questions';

/**
 * The question the seekers are choosing, as it would be if they asked it now, for the map to show like a question
 * already asked. From the server, which knows the seekers' nearest places. Kept apart from the questions tab, as the
 * map is what shows it.
 */
@Injectable()
export class QuestionPreviewService {
  private readonly session = inject(GameSessionService);
  private readonly questionApi = inject(QuestionControllerService);
  private readonly geolocation = inject(GeolocationService);

  /** What the seekers have chosen so far; null while they are not choosing. */
  readonly request = signal<AskRequest | null>(null);

  private readonly gameId = computed(() => this.session.game()?.id);
  /** About 100 m: a walk changes the question, the wobble of the GPS does not. */
  private readonly near = computed(() => {
    const position = this.geolocation.position();
    return position ? `${position.longitude.toFixed(3)},${position.latitude.toFixed(3)}` : null;
  });

  private readonly preview = rxResource({
    params: () => {
      const gameId = this.gameId();
      const request = this.request();
      return gameId && request ? { gameId, request, near: this.near() } : undefined;
    },
    stream: ({ params }) => this.questionApi.previewQuestion(params.gameId, params.request)
  });

  /** The question to show; null until it has loaded, or if it could not be. */
  readonly question = computed<QuestionDTO | null>(() => {
    const request = this.request();
    if (!request || !this.preview.hasValue()) return null;
    return {
      id: PREVIEW_QUESTION_ID,
      type: request.type,
      params: this.preview.value(),
      status: 'PENDING',
      askedBy: '',
      askedAt: '',
      deadlineAt: ''
    };
  });
}
