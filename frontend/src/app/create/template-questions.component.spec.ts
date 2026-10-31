import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QUESTION_KINDS, QuestionSettings, questionRules, QuestionType } from '../game/questions';
import { expectNoAxeViolations } from '../../testing/axe';
import { TemplateEditorService } from './template-editor.service';
import { TemplateQuestionsComponent } from './template-questions.component';

describe('TemplateQuestionsComponent', () => {
  let questions: ReturnType<typeof signal<QuestionSettings>>;
  let canEdit: ReturnType<typeof signal<boolean>>;
  let fixture: ComponentFixture<TemplateQuestionsComponent>;
  let element: HTMLElement;

  beforeEach(() => {
    questions = signal({});
    canEdit = signal(true);
    TestBed.configureTestingModule({
      imports: [TemplateQuestionsComponent],
      providers: [{
        provide: TemplateEditorService,
        useValue: {
          questions,
          canEdit,
          busy: signal(false),
          setQuestionRules: (type: QuestionType, change: object) =>
            questions.update(current => ({ ...current, [type]: { ...questionRules(current, type), ...change } }))
        }
      }]
    });
    fixture = TestBed.createComponent(TemplateQuestionsComponent);
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  });

  const group = (label: string) => element.querySelector(`[aria-label="${label}"]`)!;
  const checkbox = (scope: Element, label: string) => [...scope.querySelectorAll('label')]
    .find(item => item.textContent?.trim() === label)!.querySelector('input') as HTMLInputElement;
  const summaries = (scope: Element) => [...scope.querySelectorAll('summary')].map(item => item.textContent?.replace(/\s+/g, ' ').trim());

  function change(input: HTMLInputElement, value?: string): void {
    if (value !== undefined) input.value = value;
    else input.checked = !input.checked;
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  it('has a line for every kind of question, all available and at the usual time by default', async () => {
    expect(element.querySelectorAll('.question-rules')).toHaveLength(QUESTION_KINDS.length);
    for (const kind of QUESTION_KINDS) {
      expect(checkbox(group(kind.label), kind.label).checked).toBe(true);
      expect((element.querySelector(`#answer-minutes-${kind.type}`) as HTMLInputElement).value).toBe('5');
    }
    expect(element.querySelector('legend')?.textContent).toContain('6 of 6 kinds');
    await expectNoAxeViolations(element);
  });

  it('offers each kind of question the choices it has', () => {
    expect(summaries(group('Matching'))).toEqual(['Places 14 of 14']);
    expect(summaries(group('Radar'))).toEqual(['Distances 6 of 6']);
    expect(summaries(group('Thermometer'))).toEqual([]);
    expect(summaries(group('Tentacles'))).toEqual(['Places 14 of 14', 'Distances 4 of 4']);
  });

  it('turns a kind of question off, and hides what it no longer needs', () => {
    change(checkbox(group('Thermometer'), 'Thermometer'));

    expect(questions()['THERMOMETER'].disabled).toBe(true);
    expect(element.querySelector('#answer-minutes-THERMOMETER')).toBeNull();
    expect(element.querySelector('legend')?.textContent).toContain('5 of 6 kinds');

    change(checkbox(group('Thermometer'), 'Thermometer'));
    expect(questions()['THERMOMETER'].disabled).toBe(false);
  });

  it('turns single places and distances off and on, for that kind of question only', () => {
    change(checkbox(group('Matching'), 'zoos'));
    change(checkbox(group('Radar'), '500 m'));

    expect(questions()['MATCHING'].disabledCategories).toEqual(['zoos']);
    expect(questions()['RADAR'].disabledDistances).toEqual([500]);
    expect(questions()['MEASURING']).toBeUndefined();
    expect(summaries(group('Matching'))).toEqual(['Places 13 of 14']);
    expect(summaries(group('Radar'))).toEqual(['Distances 5 of 6']);

    change(checkbox(group('Matching'), 'zoos'));
    expect(questions()['MATCHING'].disabledCategories).toEqual([]);
  });

  it('keeps the time to answer whole and in range, and gives a blank field the usual time', () => {
    const minutes = element.querySelector('#answer-minutes-RADAR') as HTMLInputElement;

    change(minutes, '12');
    expect(questions()['RADAR'].answerMinutes).toBe(12);
    expect(questions()['MATCHING']).toBeUndefined();

    change(minutes, '999');
    expect(questions()['RADAR'].answerMinutes).toBe(120);
    expect(minutes.value).toBe('120');

    change(minutes, '0');
    expect(questions()['RADAR'].answerMinutes).toBe(1);

    change(minutes, '');
    expect(questions()['RADAR'].answerMinutes).toBe(5);
    expect(minutes.value).toBe('5');
  });

  it('shows a template it cannot change, without letting it be changed', async () => {
    canEdit.set(false);
    fixture.detectChanges();
    expect((element.querySelector('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
    await expectNoAxeViolations(element);
  });
});
