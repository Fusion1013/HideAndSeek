import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';

import { getDistance } from 'ol/sphere';

import type { AskRequest, Position, QuestionDTO } from '../api/generated';
import { GeolocationService } from '../position/geolocation.service';
import { formatAge, formatApproximateDistance } from '../shared/format';
import { injectFocusAfterRender } from '../shared/focus';
import { GameSessionService } from './game-session.service';
import { NearestPlaceComponent } from './nearest-place.component';
import { PhotoAnswerComponent } from './photo-answer.component';
import { QuestionPhotoComponent } from './question-photo.component';
import { QuestionPreviewService } from './question-preview.service';
import { answerText, nearestText, offeredKinds, photoRules, QUESTION_CATEGORIES, QUESTION_KINDS, questionKind, questionText, QuestionType } from './questions';
import { PathPoint, ThermometerDraftService } from './thermometer-draft.service';

/**
 * The questions tab: seekers ask (one at a time, while seeking), hiders answer the waiting question before its
 * deadline, and everyone sees what was asked and answered.
 */
@Component({
  selector: 'app-questions-panel',
  imports: [NearestPlaceComponent, PhotoAnswerComponent, QuestionPhotoComponent, ReactiveFormsModule],
  template: `
    @if (pending(); as question) {
      <section class="panel-section pending-question" aria-labelledby="pending-heading">
        <h3 id="pending-heading" class="panel-heading" tabindex="-1">
          {{ isHider() ? 'Answer the seekers' : 'Waiting for the hiders' }}
          <span aria-hidden="true">{{ timeLeft(question) }}</span>
        </h3>
        <p class="question-text">{{ text(question) }}</p>
        @if (nearest(question); as nearest) {
          <p class="status-text">{{ nearest }}</p>
        }
        @if (rules(question); as rules) {
          <p class="status-text">{{ rules }}</p>
        }
        <p class="visually-hidden">Answer by {{ clock(question.deadlineAt) }}.</p>
        @if (isHider()) {
          @if (placeCategory(question); as category) {
            <app-nearest-place [category]="category" [canUse]="hasPlaceChoice(question)"
              (use)="placeForm.controls.name.setValue($event)" />
          }
          <div class="panel-actions">
            @for (option of kind(question.type).choices; track option.choice) {
              @if (option.choice === 'PLACE') {
                <form class="place-answer" [formGroup]="placeForm" (ngSubmit)="answerPlace(question)">
                  <label class="control-field" for="place-name">
                    Nearest place
                    <input id="place-name" type="text" autocomplete="off" maxlength="100" formControlName="name">
                  </label>
                  <button type="submit" [disabled]="session.busy()">Send</button>
                </form>
              } @else if (option.choice === 'PHOTO') {
                <app-photo-answer [busy]="session.busy()" (send)="answerPhoto(question, $event)" />
              } @else {
                <button type="button" [disabled]="session.busy()" (click)="answer(question, option.choice)">{{ option.label }}</button>
              }
            }
          </div>
        }
      </section>
    }

    @if (isSeeker()) {
      <form class="panel-section" [formGroup]="form" (ngSubmit)="ask()" aria-labelledby="ask-heading">
        <h3 id="ask-heading" class="panel-heading">Ask a question</h3>
        @if (session.game()?.status !== 'SEEKING') {
          <p class="status-text">You can ask once the hiding time is over.</p>
        } @else if (pending()) {
          <p class="status-text">You can ask again once the hiders have answered.</p>
        } @else if (kinds().length === 0) {
          <p class="status-text">This game has no questions to ask.</p>
        } @else {
          <fieldset class="question-kinds">
            <legend class="status-text">Kind of question</legend>
            @for (kind of kinds(); track kind.type) {
              <label class="question-kind">
                <input type="radio" formControlName="type" [value]="kind.type">
                <span><strong>{{ kind.label }}</strong> <span class="status-text">{{ kind.summary }}</span></span>
              </label>
            }
          </fieldset>
          @if (chosenKind().categories.length > 0) {
            <label class="control-field" for="question-category">
              {{ chosenKind().categoryLabel }}
              <select id="question-category" formControlName="category">
                @for (category of chosenKind().categories; track category.id) {
                  <option [value]="category.id">{{ category.name }}</option>
                }
              </select>
            </label>
          }
          @if (chosenKind().distances.length > 0) {
            <label class="control-field" for="question-distance">
              Distance
              <select id="question-distance" formControlName="distanceMeters">
                @for (distance of chosenKind().distances; track distance) {
                  <option [ngValue]="distance">{{ distanceLabel(distance) }}</option>
                }
              </select>
            </label>
          }
          @if (chosenKind().needsPath) {
            @for (point of pathPoints; track point.id) {
              <div class="path-point" role="group" [attr.aria-labelledby]="'path-' + point.id">
                <p [id]="'path-' + point.id" class="status-text">
                  <strong>{{ point.label }}</strong> {{ pointText(point.id) }}
                </p>
                <div class="panel-actions">
                  <button type="button" [attr.aria-pressed]="draft.picking() === point.id" (click)="togglePicking(point.id)">
                    {{ draft.picking() === point.id ? 'Cancel picking' : 'Pick on map' }}
                    <span class="visually-hidden">for {{ point.label }}</span>
                  </button>
                  <button type="button" [disabled]="!gpsPosition()" (click)="useMyPosition(point.id)">
                    My position
                    <span class="visually-hidden">for {{ point.label }}</span>
                  </button>
                </div>
              </div>
            }
            @if (draft.picking()) {
              <p class="status-text">Click the map to place the point. You can close this panel to see more of the map.</p>
            } @else if (!draft.complete()) {
              <p class="status-text">Set both points to ask.</p>
            }
          }
          <p class="question-preview">“{{ preview() }}”</p>
          @if (previewRules(); as rules) {
            <p class="status-text">{{ rules }}</p>
          }
          @if (previewed(); as question) {
            @if (nearest(question); as nearest) {
              <p class="status-text">{{ nearest }}</p>
            }
            @if (!chosenKind().needsPath && !question.params.origin) {
              <p class="status-text">Your position is not known yet, so this cannot be shown on the map.</p>
            }
          }
          <div class="panel-actions">
            <button type="submit" class="primary-action" [disabled]="session.busy() || !canAsk()">Ask</button>
          </div>
        }
      </form>
    }

    @if (session.error()) {
      <p class="load-error" role="alert">{{ session.error() }}</p>
    }
    <p class="visually-hidden" role="status">{{ announcement() }}</p>

    <section class="panel-section" aria-labelledby="history-heading">
      <h3 id="history-heading" class="panel-heading" tabindex="-1">Asked so far <span>{{ answered().length }}</span></h3>
      <ol class="question-history" reversed>
        @for (question of answered(); track question.id) {
          <li>
            <p class="question-text">{{ text(question) }}</p>
            @if (nearest(question); as nearest) {
              <p class="status-text">{{ nearest }}</p>
            }
            @if (rules(question); as rules) {
              <p class="status-text">{{ rules }}</p>
            }
            <p [class]="question.status === 'EXPIRED' ? 'answer expired' : 'answer'">{{ answerOf(question) }}</p>
            @if (question.answer?.choice === 'PHOTO') {
              <app-question-photo [question]="question" />
            }
            <p class="status-text">{{ askerName(question) }} · {{ age(question.askedAt) }}</p>
          </li>
        } @empty {
          <li class="status-text">No questions yet.</li>
        }
      </ol>
    </section>
  `,
  styleUrl: './game-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class QuestionsPanelComponent {
  protected readonly session = inject(GameSessionService);
  protected readonly draft = inject(ThermometerDraftService);
  private readonly mapPreview = inject(QuestionPreviewService);
  private readonly geolocation = inject(GeolocationService);
  private readonly focus = injectFocusAfterRender();

  protected readonly kind = questionKind;
  protected readonly text = questionText;
  protected readonly nearest = nearestText;
  protected readonly rules = photoRules;
  protected readonly answerOf = answerText;
  protected readonly distanceLabel = formatApproximateDistance;
  protected readonly pathPoints: readonly { id: PathPoint; label: string }[] = [
    { id: 'start', label: 'Start' },
    { id: 'end', label: 'End' }
  ];
  protected readonly gpsPosition = this.geolocation.position;

  protected readonly form = new FormGroup({
    type: new FormControl<QuestionType>(this.draft.selected() ? 'THERMOMETER' : 'RADAR', { nonNullable: true }),
    category: new FormControl(QUESTION_CATEGORIES[0].id, { nonNullable: true }),
    distanceMeters: new FormControl(1000, { nonNullable: true })
  });
  protected readonly placeForm = new FormGroup({ name: new FormControl('', { nonNullable: true }) });

  private readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  /** The device's clock, ticking each second for the deadline. */
  private readonly now = signal(Date.now());

  /** What the game's settings leave to ask. */
  protected readonly kinds = computed(() => offeredKinds(this.session.game()?.settings.questions ?? {}));
  protected readonly isSeeker = computed(() => this.session.me()?.role === 'SEEKER');
  protected readonly isHider = computed(() => this.session.me()?.role === 'HIDER');
  protected readonly pending = this.session.pendingQuestion;
  /** Everything but the waiting question, newest first. */
  protected readonly answered = computed(() => this.session.questions().filter(question => question.status !== 'PENDING').reverse());

  /** The form is there to choose from. */
  private readonly canChoose = computed(() =>
    this.isSeeker() && this.session.game()?.status === 'SEEKING' && !this.pending() && this.kinds().length > 0);
  protected readonly chosenKind = computed(() => {
    const kinds = this.kinds();
    return kinds.find(kind => kind.type === this.formValue().type) ?? kinds[0] ?? QUESTION_KINDS[0];
  });
  protected readonly previewed = this.mapPreview.question;
  protected readonly canAsk = computed(() => !this.chosenKind().needsPath || this.draft.complete());
  protected readonly preview = computed(() => {
    const value = this.formValue();
    const distanceMeters = this.chosenKind().needsPath ? this.pathDistance() : value.distanceMeters;
    return questionText({ type: this.chosenKind().type, params: { category: value.category, distanceMeters } });
  });
  protected readonly previewRules = computed(() =>
    photoRules({ type: this.chosenKind().type, params: { category: this.formValue().category } }));
  private readonly pathDistance = computed(() => {
    const start = this.draft.start();
    const end = this.draft.end();
    return start && end ? getDistance([start.longitude, start.latitude], [end.longitude, end.latitude]) : undefined;
  });

  /**
   * What to show on the map: the form's choices, while the form is there. A thermometer's points show themselves, and
   * a photo is not about anywhere on the map.
   */
  private readonly choosing = computed<AskRequest | null>(() => {
    if (!this.canChoose() || this.chosenKind().needsPath || this.chosenKind().type === 'PHOTO') return null;
    const { category, distanceMeters } = this.formValue();
    return this.request(category ?? QUESTION_CATEGORIES[0].id, distanceMeters ?? 0);
  });

  /** Said once by screen readers when a question arrives or is answered. */
  protected readonly announcement = computed(() => {
    const pending = this.pending();
    if (pending) return `New question: ${questionText(pending)} ${nearestText(pending) ?? photoRules(pending) ?? ''}`.trim();
    const last = this.answered()[0];
    return last ? `${questionText(last)} ${answerText(last)}.` : '';
  });

  constructor() {
    // Choices the kind of question does not offer, or that the game's settings rule out, move to its first one.
    // First among the effects, so what follows only sees choices that can be asked.
    effect(() => {
      const kind = this.chosenKind();
      const { type, category, distanceMeters } = this.formValue();
      const { controls } = this.form;
      if (type !== kind.type) controls.type.setValue(kind.type);
      if (kind.categories.length > 0 && !kind.categories.some(candidate => candidate.id === category)) {
        controls.category.setValue(kind.categories[0].id);
      }
      if (kind.distances.length > 0 && !kind.distances.includes(distanceMeters ?? 0)) {
        controls.distanceMeters.setValue(kind.distances[0]);
      }
    });

    effect(() => this.mapPreview.request.set(this.choosing()));
    effect(() => {
      const selected = this.canChoose() && this.chosenKind().needsPath;
      this.draft.selected.set(selected);
      // The next click on the map is not for a question no longer being chosen
      if (!selected) this.draft.picking.set(null);
    });

    const ticker = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(ticker);
      this.mapPreview.request.set(null);
    });
  }

  protected async ask(): Promise<void> {
    const { category, distanceMeters } = this.form.getRawValue();
    const kind = this.chosenKind();
    const asked = await this.session.ask(this.request(category, distanceMeters));
    if (!asked) return;
    if (kind.needsPath) this.draft.clear();
    // The form gives way to the waiting question
    this.focus('pending-heading');
  }

  /** The chosen kind of question, with only what it needs. */
  private request(category: string, distanceMeters: number): AskRequest {
    const kind = this.chosenKind();
    return {
      type: kind.type,
      ...(kind.categories.length > 0 ? { category } : {}),
      ...(kind.distances.length > 0 ? { distanceMeters } : {}),
      ...(kind.needsPath ? { start: this.draft.start() ?? undefined, end: this.draft.end() ?? undefined } : {})
    };
  }

  protected pointText(which: PathPoint): string {
    const point: Position | null = this.draft.point(which);
    return point ? `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}` : 'not set';
  }

  /** Picking the same point again cancels it. */
  protected togglePicking(which: PathPoint): void {
    this.draft.picking.update(picking => picking === which ? null : which);
  }

  protected useMyPosition(which: PathPoint): void {
    const position = this.gpsPosition();
    if (position) this.draft.set(which, { longitude: position.longitude, latitude: position.latitude });
  }

  protected async answer(question: QuestionDTO, choice: string): Promise<void> {
    // The question moves to the history, where the answer now is
    if (await this.session.answer(question.id, { choice })) this.focus('history-heading');
  }

  protected async answerPlace(question: QuestionDTO): Promise<void> {
    const name = this.placeForm.controls.name.value.trim();
    if (!name) {
      this.session.error.set('Name the place, or answer that there is none.');
      return;
    }
    if (await this.session.answer(question.id, { choice: 'PLACE', text: name })) {
      this.placeForm.reset();
      this.focus('history-heading');
    }
  }

  protected async answerPhoto(question: QuestionDTO, photo: Blob): Promise<void> {
    if (await this.session.answerWithPhoto(question.id, photo)) this.focus('history-heading');
  }

  /** The category of place to help the hiders with; a photo's subject is not one. */
  protected placeCategory(question: QuestionDTO): string | undefined {
    return question.type === 'PHOTO' ? undefined : question.params.category;
  }

  protected hasPlaceChoice(question: QuestionDTO): boolean {
    return questionKind(question.type).choices.some(choice => choice.choice === 'PLACE');
  }

  protected timeLeft(question: QuestionDTO): string {
    const seconds = Math.max(0, Math.ceil((Date.parse(question.deadlineAt) - this.session.serverNow(this.now())) / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} left`;
  }

  protected clock(time: string): string {
    return new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  protected age(time: string): string {
    return formatAge(this.session.serverNow(this.now()) - Date.parse(time));
  }

  protected askerName(question: QuestionDTO): string {
    return this.session.game()?.players.find(player => player.id === question.askedBy)?.displayName ?? 'A seeker';
  }
}
