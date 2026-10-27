import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';

import type { QuestionDTO } from '../api/generated';
import { formatAge, formatApproximateDistance } from '../shared/format';
import { injectFocusAfterRender } from '../shared/focus';
import { GameSessionService } from './game-session.service';
import { NearestPlaceComponent } from './nearest-place.component';
import { answerText, QUESTION_CATEGORIES, QUESTION_KINDS, questionKind, questionText, QuestionType } from './questions';

/**
 * The questions tab: seekers ask (one at a time, while seeking), hiders answer the waiting question before its
 * deadline, and everyone sees what was asked and answered.
 */
@Component({
  selector: 'app-questions-panel',
  imports: [NearestPlaceComponent, ReactiveFormsModule],
  template: `
    @if (pending(); as question) {
      <section class="panel-section pending-question" aria-labelledby="pending-heading">
        <h3 id="pending-heading" class="panel-heading" tabindex="-1">
          {{ isHider() ? 'Answer the seekers' : 'Waiting for the hiders' }}
          <span aria-hidden="true">{{ timeLeft(question) }}</span>
        </h3>
        <p class="question-text">{{ text(question) }}</p>
        <p class="visually-hidden">Answer by {{ clock(question.deadlineAt) }}.</p>
        @if (isHider()) {
          @if (question.params.category; as category) {
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
        } @else {
          <fieldset class="question-kinds">
            <legend class="status-text">Kind of question</legend>
            @for (kind of kinds; track kind.type) {
              <label class="question-kind">
                <input type="radio" formControlName="type" [value]="kind.type">
                <span><strong>{{ kind.label }}</strong> <span class="status-text">{{ kind.summary }}</span></span>
              </label>
            }
          </fieldset>
          @if (chosenKind().needsCategory) {
            <label class="control-field" for="question-category">
              Place
              <select id="question-category" formControlName="category">
                @for (category of categories; track category.id) {
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
          <p class="question-preview">“{{ preview() }}”</p>
          <div class="panel-actions">
            <button type="submit" class="primary-action" [disabled]="session.busy()">Ask</button>
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
            <p [class]="question.status === 'EXPIRED' ? 'answer expired' : 'answer'">{{ answerOf(question) }}</p>
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
  private readonly focus = injectFocusAfterRender();

  protected readonly kinds = QUESTION_KINDS;
  protected readonly categories = QUESTION_CATEGORIES;
  protected readonly kind = questionKind;
  protected readonly text = questionText;
  protected readonly answerOf = answerText;
  protected readonly distanceLabel = formatApproximateDistance;

  protected readonly form = new FormGroup({
    type: new FormControl<QuestionType>('RADAR', { nonNullable: true }),
    category: new FormControl(QUESTION_CATEGORIES[0].id, { nonNullable: true }),
    distanceMeters: new FormControl(1000, { nonNullable: true })
  });
  protected readonly placeForm = new FormGroup({ name: new FormControl('', { nonNullable: true }) });

  private readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  /** The device's clock, ticking each second for the deadline. */
  private readonly now = signal(Date.now());

  protected readonly isSeeker = computed(() => this.session.me()?.role === 'SEEKER');
  protected readonly isHider = computed(() => this.session.me()?.role === 'HIDER');
  protected readonly pending = this.session.pendingQuestion;
  /** Everything but the waiting question, newest first. */
  protected readonly answered = computed(() => this.session.questions().filter(question => question.status !== 'PENDING').reverse());

  protected readonly chosenKind = computed(() => questionKind(this.formValue().type ?? 'RADAR'));
  protected readonly preview = computed(() => {
    const value = this.formValue();
    return questionText({
      type: value.type ?? 'RADAR',
      params: { category: value.category, distanceMeters: value.distanceMeters }
    });
  });

  /** Said once by screen readers when a question arrives or is answered. */
  protected readonly announcement = computed(() => {
    const pending = this.pending();
    if (pending) return `New question: ${questionText(pending)}`;
    const last = this.answered()[0];
    return last ? `${questionText(last)} ${answerText(last)}.` : '';
  });

  constructor() {
    // A kind of question that takes other distances starts on its first one
    this.form.controls.type.valueChanges.pipe(takeUntilDestroyed()).subscribe(type => {
      const distances = questionKind(type).distances;
      if (distances.length > 0 && !distances.includes(this.form.controls.distanceMeters.value)) {
        this.form.controls.distanceMeters.setValue(distances[0]);
      }
    });

    const ticker = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(ticker));
  }

  protected async ask(): Promise<void> {
    const { type, category, distanceMeters } = this.form.getRawValue();
    const kind = questionKind(type);
    const asked = await this.session.ask({
      type,
      ...(kind.needsCategory ? { category } : {}),
      ...(kind.distances.length > 0 ? { distanceMeters } : {})
    });
    // The form gives way to the waiting question
    if (asked) this.focus('pending-heading');
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
