import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import type { GameDTO, QuestionDTO } from '../api/generated';
import { GameSessionService } from './game-session.service';
import { answerText, questionText } from './questions';
import { QuestionsPanelComponent } from './questions-panel.component';
import { expectNoAxeViolations } from '../../testing/axe';

const NOW = Date.parse('2026-10-25T12:00:00Z');

function question(overrides: Partial<QuestionDTO> = {}): QuestionDTO {
  return {
    id: 'q1',
    type: 'RADAR',
    params: { distanceMeters: 2000, origin: { longitude: 11.97, latitude: 57.7 } },
    status: 'PENDING',
    askedBy: 'p1',
    askedAt: new Date(NOW - 60_000).toISOString(),
    deadlineAt: new Date(NOW + 4 * 60_000).toISOString(),
    ...overrides
  };
}

describe('question wording', () => {
  it('says each kind of question and its answer in words', () => {
    expect(questionText(question())).toBe('Are you within 2.0 km of us?');
    expect(questionText(question({ type: 'MATCHING', params: { category: 'museums' } })))
      .toBe('Is your nearest museum the same as ours?');
    expect(questionText(question({ type: 'TENTACLES', params: { category: 'libraries', distanceMeters: 1000 } })))
      .toBe('Of the libraries within 1.0 km of us, which are you nearest to?');
    expect(questionText(question({ type: 'THERMOMETER', params: { distanceMeters: 500 } })))
      .toBe('We moved 500 m. Are we hotter or colder?');

    expect(answerText(question())).toBe('Waiting for the hiders');
    expect(answerText(question({ status: 'ANSWERED', answer: { choice: 'YES' } }))).toBe('Yes');
    expect(answerText(question({ type: 'MEASURING', status: 'ANSWERED', answer: { choice: 'FURTHER' } }))).toBe('Further');
    expect(answerText(question({ type: 'TENTACLES', status: 'ANSWERED', answer: { choice: 'PLACE', text: 'Röhsska' } })))
      .toBe('Röhsska');
    expect(answerText(question({ status: 'EXPIRED' }))).toBe('Not answered in time');
  });
});

describe('QuestionsPanelComponent', () => {
  let role: ReturnType<typeof signal<'SEEKER' | 'HIDER'>>;
  let status: ReturnType<typeof signal<GameDTO['status']>>;
  let questions: ReturnType<typeof signal<QuestionDTO[]>>;
  let ask: ReturnType<typeof vi.fn>;
  let answer: ReturnType<typeof vi.fn>;
  let fixture: ComponentFixture<QuestionsPanelComponent>;
  let element: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(NOW);
    role = signal('SEEKER');
    status = signal('SEEKING');
    questions = signal([]);
    ask = vi.fn(() => Promise.resolve(true));
    answer = vi.fn(() => Promise.resolve(true));

    TestBed.configureTestingModule({
      imports: [QuestionsPanelComponent],
      providers: [{
        provide: GameSessionService,
        useValue: {
          game: computed(() => ({ status: status(), players: [{ id: 'p1', displayName: 'Ada', host: true }] })),
          me: computed(() => ({ id: 'me', displayName: 'Me', host: false, role: role() })),
          questions,
          pendingQuestion: computed(() => questions().find(item => item.status === 'PENDING') ?? null),
          busy: signal(false),
          error: signal(''),
          serverNow: (deviceNow: number) => deviceNow,
          ask,
          answer
        }
      }]
    });
    fixture = TestBed.createComponent(QuestionsPanelComponent);
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => vi.useRealTimers());

  function choose(label: string): void {
    const radio = [...element.querySelectorAll('.question-kind')].find(item => item.textContent?.includes(label))!
      .querySelector('input') as HTMLInputElement;
    radio.click();
    fixture.detectChanges();
  }

  it('lets a seeker ask, with only what the kind of question needs', async () => {
    await expectNoAxeViolations(element);
    expect(element.querySelector('.question-preview')?.textContent).toBe('“Are you within 1.0 km of us?”');
    expect(element.querySelector('#question-category')).toBeNull();

    choose('Matching');
    expect(element.querySelector('#question-distance')).toBeNull();
    const category = element.querySelector('#question-category') as HTMLSelectElement;
    category.value = 'parks';
    category.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(element.querySelector('.question-preview')?.textContent).toBe('“Is your nearest park the same as ours?”');

    (element.querySelector('button[type=submit]') as HTMLButtonElement).click();
    expect(ask).toHaveBeenCalledWith({ type: 'MATCHING', category: 'parks' });
    questions.set([]);

    // Thermometer offers 1 km too, so the distance stays; tentacles does not offer it either way
    choose('Thermometer');
    expect((element.querySelector('#question-distance') as HTMLSelectElement).selectedOptions[0].textContent?.trim()).toBe('1.0 km');
    (element.querySelector('button[type=submit]') as HTMLButtonElement).click();
    expect(ask).toHaveBeenLastCalledWith({ type: 'THERMOMETER', distanceMeters: 1000 });

    choose('Radar');
    const distance = element.querySelector('#question-distance') as HTMLSelectElement;
    distance.value = [...distance.options].find(option => option.textContent?.trim() === '25.0 km')!.value;
    distance.dispatchEvent(new Event('change'));
    choose('Tentacles');
    expect((element.querySelector('#question-distance') as HTMLSelectElement).selectedOptions[0].textContent?.trim()).toBe('1.0 km');
  });

  it('asks seekers to wait while a question is open, and before seeking', () => {
    questions.set([question()]);
    fixture.detectChanges();
    expect(element.querySelector('.question-kinds')).toBeNull();
    expect(element.textContent).toContain('You can ask again once the hiders have answered.');
    expect(element.querySelector('#pending-heading')?.textContent).toContain('Waiting for the hiders');
    expect(element.querySelector('#pending-heading')?.textContent).toContain('4:00 left');

    questions.set([]);
    status.set('HIDING');
    fixture.detectChanges();
    expect(element.textContent).toContain('You can ask once the hiding time is over.');
  });

  it('lets a hider answer the waiting question, by choice or by naming a place', async () => {
    role.set('HIDER');
    questions.set([question()]);
    fixture.detectChanges();
    await expectNoAxeViolations(element);
    expect(element.querySelector('#ask-heading')).toBeNull();
    expect(element.querySelector('#pending-heading')?.textContent).toContain('Answer the seekers');

    [...element.querySelectorAll('.pending-question button')].find(button => button.textContent?.trim() === 'No')!
      .dispatchEvent(new Event('click'));
    expect(answer).toHaveBeenCalledWith('q1', { choice: 'NO' });

    questions.set([question({ id: 'q2', type: 'TENTACLES', params: { category: 'museums', distanceMeters: 2000 } })]);
    fixture.detectChanges();
    const place = element.querySelector('#place-name') as HTMLInputElement;
    place.value = 'Röhsska';
    place.dispatchEvent(new Event('input'));
    (element.querySelector('.place-answer button') as HTMLButtonElement).click();
    expect(answer).toHaveBeenLastCalledWith('q2', { choice: 'PLACE', text: 'Röhsska' });
    await expectNoAxeViolations(element);
  });

  it('moves focus to what replaces the form or the question', async () => {
    document.body.append(element);
    ask.mockImplementation(() => {
      questions.set([question()]);
      return Promise.resolve(true);
    });
    (element.querySelector('button[type=submit]') as HTMLButtonElement).click();
    await Promise.resolve();
    fixture.detectChanges();
    expect(document.activeElement?.id).toBe('pending-heading');

    role.set('HIDER');
    answer.mockImplementation(() => {
      questions.set([question({ status: 'ANSWERED', answer: { choice: 'YES' } })]);
      return Promise.resolve(true);
    });
    fixture.detectChanges();
    [...element.querySelectorAll('.pending-question button')].find(button => button.textContent?.trim() === 'Yes')!
      .dispatchEvent(new Event('click'));
    await Promise.resolve();
    fixture.detectChanges();
    expect(document.activeElement?.id).toBe('history-heading');
  });

  it('lists what was asked and answered, newest first', async () => {
    questions.set([
      question({ id: 'q1', status: 'ANSWERED', answer: { choice: 'YES' } }),
      question({ id: 'q2', type: 'MATCHING', params: { category: 'zoos' }, status: 'EXPIRED' })
    ]);
    fixture.detectChanges();

    const items = [...element.querySelectorAll('.question-history li')]
      .map(item => [...item.querySelectorAll('p')].map(line => line.textContent?.trim()));
    expect(items).toEqual([
      ['Is your nearest zoo the same as ours?', 'Not answered in time', 'Ada · 1 min ago'],
      ['Are you within 2.0 km of us?', 'Yes', 'Ada · 1 min ago']
    ]);
    await expectNoAxeViolations(element);
  });
});
