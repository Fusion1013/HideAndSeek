import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  DEFAULT_ANSWER_MINUTES, MAX_ANSWER_MINUTES, MIN_ANSWER_MINUTES, offeredKinds, QUESTION_KINDS, QuestionKind,
  questionRules
} from '../game/questions';
import { formatApproximateDistance } from '../shared/format';
import { TemplateEditorService } from './template-editor.service';

function checked(event: Event): boolean {
  return (event.target as HTMLInputElement).checked;
}

function withChoice<T>(disabled: readonly T[], choice: T, available: boolean): T[] {
  const others = disabled.filter(item => item !== choice);
  return available ? others : [...others, choice];
}

/**
 * Which questions a template's games may ask, and how long the hiders have to answer each kind. Everything here comes
 * from the list of kinds of question, so a kind, category or distance added there shows up by itself.
 */
@Component({
  selector: 'app-template-questions',
  template: `
    <fieldset class="panel-section" [disabled]="!editor.canEdit() || editor.busy()">
      <legend class="panel-heading">
        Questions
        <span>{{ offeredCount() }} of {{ kinds.length }} kinds</span>
      </legend>
      @for (kind of kinds; track kind.type) {
        @let rules = rulesOf(kind);
        <div class="question-rules" role="group" [attr.aria-label]="kind.label">
          <label class="check-field">
            <input type="checkbox" [checked]="!rules.disabled" (change)="setAvailable(kind, $event)">
            {{ kind.label }}
          </label>
          @if (!rules.disabled) {
            <label class="control-field rule-minutes" [for]="'answer-minutes-' + kind.type">
              Minutes to answer
              <input [id]="'answer-minutes-' + kind.type" type="number" step="1" [min]="minMinutes" [max]="maxMinutes"
                [value]="rules.answerMinutes ?? defaultMinutes" (change)="setAnswerMinutes(kind, $event)">
            </label>
            @if (kind.categories.length > 0) {
              <details>
                <summary>
                  {{ kind.categoryLabel }}s
                  <span>{{ kind.categories.length - rules.disabledCategories.length }} of {{ kind.categories.length }}</span>
                </summary>
                @for (category of kind.categories; track category.id) {
                  <label class="check-field">
                    <input type="checkbox" [checked]="!rules.disabledCategories.includes(category.id)"
                      (change)="setCategory(kind, category.id, $event)">
                    {{ category.plural }}
                  </label>
                }
              </details>
            }
            @if (kind.distances.length > 0) {
              <details>
                <summary>
                  Distances
                  <span>{{ kind.distances.length - rules.disabledDistances.length }} of {{ kind.distances.length }}</span>
                </summary>
                @for (distance of kind.distances; track distance) {
                  <label class="check-field">
                    <input type="checkbox" [checked]="!rules.disabledDistances.includes(distance)"
                      (change)="setDistance(kind, distance, $event)">
                    {{ distanceLabel(distance) }}
                  </label>
                }
              </details>
            }
          }
        </div>
      }
    </fieldset>
  `,
  styleUrl: './create-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TemplateQuestionsComponent {
  protected readonly editor = inject(TemplateEditorService);

  protected readonly kinds = QUESTION_KINDS;
  protected readonly defaultMinutes = DEFAULT_ANSWER_MINUTES;
  protected readonly minMinutes = MIN_ANSWER_MINUTES;
  protected readonly maxMinutes = MAX_ANSWER_MINUTES;
  protected readonly distanceLabel = formatApproximateDistance;

  protected readonly offeredCount = computed(() => offeredKinds(this.editor.questions()).length);

  protected rulesOf(kind: QuestionKind) {
    return questionRules(this.editor.questions(), kind.type);
  }

  protected setAvailable(kind: QuestionKind, event: Event): void {
    this.editor.setQuestionRules(kind.type, { disabled: !checked(event) });
  }

  /** Whatever is typed becomes a time that can be saved; nothing at all, the default. */
  protected setAnswerMinutes(kind: QuestionKind, event: Event): void {
    const input = event.target as HTMLInputElement;
    const typed = Number.isNaN(input.valueAsNumber) ? DEFAULT_ANSWER_MINUTES : Math.round(input.valueAsNumber);
    const answerMinutes = Math.min(Math.max(typed, MIN_ANSWER_MINUTES), MAX_ANSWER_MINUTES);
    input.value = String(answerMinutes);
    this.editor.setQuestionRules(kind.type, { answerMinutes });
  }

  protected setCategory(kind: QuestionKind, category: string, event: Event): void {
    const { disabledCategories } = this.rulesOf(kind);
    this.editor.setQuestionRules(kind.type, { disabledCategories: withChoice(disabledCategories, category, checked(event)) });
  }

  protected setDistance(kind: QuestionKind, distance: number, event: Event): void {
    const { disabledDistances } = this.rulesOf(kind);
    this.editor.setQuestionRules(kind.type, { disabledDistances: withChoice(disabledDistances, distance, checked(event)) });
  }
}
