import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { of } from 'rxjs';

import { QuestionControllerService } from '../api/generated';
import type { GameDTO, QuestionDTO, QuestionRules } from '../api/generated';
import { ClosestLocationsService } from '../distance/closest-locations.service';
import { LayerService } from '../layer/layer.service';
import { GeolocationService } from '../position/geolocation.service';
import { GameSessionService } from './game-session.service';
import { QuestionPreviewService } from './question-preview.service';
import { answerText, nearestText, offeredKinds, PHOTO_SUBJECTS, photoRules, QUESTION_CATEGORIES, QUESTION_KINDS, questionText } from './questions';
import { QuestionsPanelComponent } from './questions-panel.component';
import { ThermometerDraftService } from './thermometer-draft.service';
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
    expect(questionText(question({ type: 'THERMOMETER', params: {} }))).toBe('We moved. Are we hotter or colder?');
    expect(questionText(question({ type: 'PHOTO', params: { category: 'tree' } }))).toBe('Send a photo: A tree');

    expect(answerText(question())).toBe('Waiting for the hiders');
    expect(answerText(question({ status: 'ANSWERED', answer: { choice: 'YES' } }))).toBe('Yes');
    expect(answerText(question({ type: 'MEASURING', status: 'ANSWERED', answer: { choice: 'FURTHER' } }))).toBe('Further');
    expect(answerText(question({ type: 'TENTACLES', status: 'ANSWERED', answer: { choice: 'PLACE', text: 'Röhsska' } })))
      .toBe('Röhsska');
    expect(answerText(question({ type: 'PHOTO', status: 'ANSWERED', answer: { choice: 'PHOTO' } }))).toBe('Photo sent');
    expect(answerText(question({ status: 'EXPIRED' }))).toBe('Not answered in time');
  });

  it('says what a photo must show, for photo questions only', () => {
    expect(photoRules(question({ type: 'PHOTO', params: { category: 'tree' } }))).toBe('Must include the entire tree.');
    expect(photoRules(question({ type: 'MATCHING', params: { category: 'tree' } }))).toBeNull();
  });

  it('offers every subject of a photo once, as a category the backend accepts, with what it must show', () => {
    expect(new Set(PHOTO_SUBJECTS.map(subject => subject.id)).size).toBe(20);
    expect(new Set(PHOTO_SUBJECTS.map(subject => subject.name)).size).toBe(20);
    for (const subject of PHOTO_SUBJECTS) {
      expect(subject.id).toMatch(/^[a-z0-9_]{1,40}$/);
      expect(subject.rules).toBeTruthy();
    }
  });
});

describe('the kinds of question a game offers', () => {
  const rules = (change: Partial<QuestionRules>): QuestionRules =>
    ({ disabled: false, disabledCategories: [], disabledDistances: [], ...change });

  it('is all of them, with all their choices, unless the settings say otherwise', () => {
    expect(offeredKinds({})).toEqual(QUESTION_KINDS);
  });

  it('leaves out what the settings rule out, for that kind of question only', () => {
    const kinds = offeredKinds({
      MATCHING: rules({ disabled: true }),
      MEASURING: rules({ disabledCategories: ['zoos'] }),
      RADAR: rules({ disabledDistances: [500] })
    });

    expect(kinds.map(kind => kind.type)).toEqual(['MEASURING', 'RADAR', 'THERMOMETER', 'TENTACLES', 'PHOTO']);
    expect(kinds[0].categories.map(category => category.id)).not.toContain('zoos');
    expect(kinds[1].distances).not.toContain(500);
    expect(kinds[3].categories).toEqual(QUESTION_CATEGORIES);
  });

  it('leaves out a kind of question with nothing left to choose', () => {
    const kinds = offeredKinds({ TENTACLES: rules({ disabledCategories: QUESTION_CATEGORIES.map(category => category.id) }) });
    expect(kinds.map(kind => kind.type)).not.toContain('TENTACLES');
  });
});

describe('the seekers\' nearest place', () => {
  const nearest = { name: 'Röhsska', longitude: 11.98, latitude: 57.7, distanceMeters: 1240 };

  it('names it for matching, and gives its distance for measuring', () => {
    expect(nearestText(question({ type: 'MATCHING', params: { category: 'museums', nearest } })))
      .toBe('The seekers\' nearest museum: Röhsska');
    expect(nearestText(question({ type: 'MEASURING', params: { category: 'museums', nearest } })))
      .toBe('The seekers\' nearest museum: Röhsska, 1.24 km away');
  });

  it('says so when it is not known, and is not part of other questions', () => {
    expect(nearestText(question({ type: 'MATCHING', params: { category: 'zoos' } }))).toBe('The seekers\' nearest zoo is not known.');
    expect(nearestText(question({ type: 'MEASURING', params: { category: 'parks', nearest: { ...nearest, name: undefined } } })))
      .toBe('The seekers\' nearest park: Unnamed, 1.24 km away');
    expect(nearestText(question({ type: 'TENTACLES', params: { category: 'museums', nearest } }))).toBeNull();
    expect(nearestText(question())).toBeNull();
  });
});

describe('QuestionsPanelComponent', () => {
  let role: ReturnType<typeof signal<'SEEKER' | 'HIDER'>>;
  let status: ReturnType<typeof signal<GameDTO['status']>>;
  let questions: ReturnType<typeof signal<QuestionDTO[]>>;
  let settings: ReturnType<typeof signal<Record<string, QuestionRules>>>;
  let ask: ReturnType<typeof vi.fn>;
  let answer: ReturnType<typeof vi.fn>;
  let answerWithPhoto: ReturnType<typeof vi.fn>;
  let hidingStation: ReturnType<typeof signal<{ station: { stationId: string; name: string; longitude: number; latitude: number } } | null>>;
  let previewQuestion: ReturnType<typeof vi.fn>;
  let fixture: ComponentFixture<QuestionsPanelComponent>;
  let element: HTMLElement;

  beforeEach(() => {
    previewQuestion = vi.fn(() => of({ distanceMeters: 1000, origin: { longitude: 11.97, latitude: 57.7 } }));
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(NOW);
    role = signal('SEEKER');
    status = signal('SEEKING');
    questions = signal([]);
    settings = signal({});
    ask = vi.fn(() => Promise.resolve(true));
    answer = vi.fn(() => Promise.resolve(true));
    answerWithPhoto = vi.fn(() => Promise.resolve(true));
    hidingStation = signal(null);

    TestBed.configureTestingModule({
      imports: [QuestionsPanelComponent],
      providers: [
        ThermometerDraftService,
        QuestionPreviewService,
        { provide: QuestionControllerService, useValue: { previewQuestion, getQuestionPhoto: () => of(new Blob(['photo'])) } },
        { provide: LayerService, useValue: { getDistanceLayers: () => new Map(), visibleLayerIds: signal(new Set()) } },
        { provide: ClosestLocationsService, useValue: { nearest: () => null } },
        {
          provide: GameSessionService,
          useValue: {
            game: computed(() => ({
              id: 'g1', status: status(), settings: { questions: settings() }, players: [{ id: 'p1', displayName: 'Ada', host: true }]
            })),
            me: computed(() => ({ id: 'me', displayName: 'Me', host: false, role: role() })),
            questions,
            pendingQuestion: computed(() => questions().find(item => item.status === 'PENDING') ?? null),
            busy: signal(false),
            error: signal(''),
            serverNow: (deviceNow: number) => deviceNow,
            hidingStation,
            stations: signal([
              { stationId: 's1', name: 'Järntorget', longitude: 11.951, latitude: 57.699 },
              { stationId: 's2', name: 'Korsvägen', longitude: 11.987, latitude: 57.697 }
            ]),
            ask,
            answer,
            answerWithPhoto
          }
        }
      ]
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

    // Radar offers 25 km, tentacles does not, so the distance moves to its first
    choose('Radar');
    const distance = element.querySelector('#question-distance') as HTMLSelectElement;
    distance.value = [...distance.options].find(option => option.textContent?.trim() === '25.0 km')!.value;
    distance.dispatchEvent(new Event('change'));
    choose('Tentacles');
    expect((element.querySelector('#question-distance') as HTMLSelectElement).selectedOptions[0].textContent?.trim()).toBe('1.0 km');
  });

  describe('with settings that rule things out', () => {
    const none = { disabled: false, disabledCategories: [], disabledDistances: [] };
    const options = (select: string) => [...element.querySelectorAll<HTMLOptionElement>(`${select} option`)].map(option => option.value);

    it('offers only what is left, moving off a choice that has gone', () => {
      settings.set({
        RADAR: { ...none, disabled: true },
        MATCHING: { ...none, disabledCategories: ['game_station', 'parks'] },
        TENTACLES: { ...none, disabledDistances: [1000] }
      });
      fixture.detectChanges();

      const kinds = [...element.querySelectorAll('.question-kind')].map(kind => kind.textContent);
      expect(kinds).toHaveLength(5);
      expect(kinds.join()).not.toContain('Radar');
      // Radar was chosen; the first kind left takes over, on its first place
      expect((element.querySelector('.question-kind input') as HTMLInputElement).checked).toBe(true);
      expect(options('#question-category')).not.toContain('parks');
      expect(element.querySelector('.question-preview')?.textContent).toBe('“Is your nearest rail station the same as ours?”');

      (element.querySelector('button[type=submit]') as HTMLButtonElement).click();
      expect(ask).toHaveBeenCalledWith({ type: 'MATCHING', category: 'rail_station' });

      choose('Tentacles');
      expect(options('#question-distance')).toHaveLength(3);
      expect((element.querySelector('#question-distance') as HTMLSelectElement).selectedOptions[0].textContent?.trim()).toBe('2.0 km');
    });

    it('asks only with choices that are left, for what the map shows too', async () => {
      TestBed.tick();
      await Promise.resolve();
      previewQuestion.mockClear();

      settings.set({ RADAR: { ...none, disabledDistances: [1000] } });
      fixture.detectChanges();
      await Promise.resolve();
      TestBed.tick();
      expect(previewQuestion).toHaveBeenLastCalledWith('g1', { type: 'RADAR', distanceMeters: 500 });
      expect(previewQuestion).not.toHaveBeenCalledWith('g1', { type: 'RADAR', distanceMeters: 1000 });
    });

    it('says so when nothing is left to ask', async () => {
      settings.set(Object.fromEntries(QUESTION_KINDS.map(kind => [kind.type, { ...none, disabled: true }])));
      fixture.detectChanges();
      expect(element.querySelector('.question-kinds')).toBeNull();
      expect(element.textContent).toContain('This game has no questions to ask.');
      await expectNoAxeViolations(element);
    });
  });

  describe('showing the question being chosen on the map', () => {
    const shown = () => TestBed.inject(QuestionPreviewService).question();
    const settle = async () => {
      TestBed.tick();
      await Promise.resolve();
      TestBed.tick();
      fixture.detectChanges();
    };

    it('follows the choices, with only what each kind needs', async () => {
      await settle();
      expect(previewQuestion).toHaveBeenLastCalledWith('g1', { type: 'RADAR', distanceMeters: 1000 });
      expect(shown()?.type).toBe('RADAR');
      expect(shown()?.status).toBe('PENDING');

      previewQuestion.mockReturnValue(of({
        category: 'game_station',
        origin: { longitude: 11.97, latitude: 57.7 },
        nearest: { name: 'Järntorget', longitude: 11.951, latitude: 57.699, distanceMeters: 800 }
      }));
      choose('Measuring');
      await settle();
      expect(previewQuestion).toHaveBeenLastCalledWith('g1', { type: 'MEASURING', category: 'game_station' });
      expect(shown()?.type).toBe('MEASURING');
      expect(element.querySelector('form')?.textContent).toContain('The seekers\' nearest station: Järntorget, 800 m away');
      await expectNoAxeViolations(element);
    });

    it('says when the seekers\' position is not known', async () => {
      previewQuestion.mockReturnValue(of({ distanceMeters: 1000 }));
      choose('Tentacles');
      await settle();
      expect(element.textContent).toContain('Your position is not known yet');
    });

    it('leaves a thermometer to its points', async () => {
      await settle();
      previewQuestion.mockClear();
      choose('Thermometer');
      await settle();
      expect(previewQuestion).not.toHaveBeenCalled();
      expect(shown()).toBeNull();
    });

    it('shows a thermometer\'s points only while it is the kind chosen, and keeps them for when it is again', async () => {
      const draft = TestBed.inject(ThermometerDraftService);
      draft.set('start', { longitude: 11.97, latitude: 57.7 });
      await settle();
      expect(draft.shown().start).toBeNull();

      choose('Thermometer');
      await settle();
      expect(draft.shown().start).toEqual({ longitude: 11.97, latitude: 57.7 });
      draft.picking.set('end');

      choose('Radar');
      await settle();
      expect(draft.shown()).toEqual({ start: null, end: null });
      expect(draft.picking()).toBeNull();
      expect(draft.start()).toEqual({ longitude: 11.97, latitude: 57.7 });

      choose('Thermometer');
      await settle();
      expect(draft.shown().start).toEqual({ longitude: 11.97, latitude: 57.7 });
    });

    it('keeps thermometer chosen through a visit to another tab', async () => {
      const draft = TestBed.inject(ThermometerDraftService);
      choose('Thermometer');
      await settle();
      fixture.destroy();
      TestBed.tick();
      expect(draft.selected()).toBe(true);

      fixture = TestBed.createComponent(QuestionsPanelComponent);
      fixture.detectChanges();
      element = fixture.nativeElement as HTMLElement;
      expect([...element.querySelectorAll<HTMLInputElement>('.question-kind input')].find(radio => radio.checked)?.closest('label')?.textContent)
        .toContain('Thermometer');
      expect(draft.selected()).toBe(true);
    });

    it('hides a thermometer\'s points while the form is gone', async () => {
      const draft = TestBed.inject(ThermometerDraftService);
      choose('Thermometer');
      await settle();
      questions.set([question()]);
      await settle();
      expect(draft.selected()).toBe(false);
    });

    it('stops once the question is asked, and when the tab closes', async () => {
      await settle();
      questions.set([question()]);
      await settle();
      expect(shown()).toBeNull();

      questions.set([]);
      await settle();
      expect(shown()).not.toBeNull();
      fixture.destroy();
      TestBed.tick();
      expect(shown()).toBeNull();
    });
  });

  it('takes a thermometer question from two points, set by hand or from the map', async () => {
    const draft = TestBed.inject(ThermometerDraftService);
    const submit = () => element.querySelector('button[type=submit]') as HTMLButtonElement;
    const button = (name: string) => [...element.querySelectorAll('.path-point button')]
      .find(item => item.textContent?.replace(/\s+/g, ' ').trim() === name) as HTMLButtonElement;

    choose('Thermometer');
    expect(element.querySelector('#question-distance')).toBeNull();
    expect(submit().disabled).toBe(true);
    expect(button('My position for Start').disabled).toBe(true);
    expect(element.querySelector('.question-preview')?.textContent).toBe('“We moved. Are we hotter or colder?”');

    TestBed.inject(GeolocationService).position.set({ longitude: 11.97, latitude: 57.7, accuracyMeters: 5, timestamp: NOW });
    fixture.detectChanges();
    button('My position for Start').click();
    fixture.detectChanges();
    expect(element.querySelector('#path-start')?.textContent).toContain('57.70000, 11.97000');
    expect(submit().disabled).toBe(true);

    button('Pick on map for End').click();
    fixture.detectChanges();
    expect(draft.picking()).toBe('end');
    expect(button('Cancel picking for End').getAttribute('aria-pressed')).toBe('true');
    await expectNoAxeViolations(element);

    // As the map does on a click
    draft.set('end', { longitude: 11.97, latitude: 57.71 });
    fixture.detectChanges();
    expect(element.querySelector('.question-preview')?.textContent).toBe('“We moved 1.1 km. Are we hotter or colder?”');
    expect(submit().disabled).toBe(false);

    submit().click();
    expect(ask).toHaveBeenLastCalledWith({
      type: 'THERMOMETER',
      start: { longitude: 11.97, latitude: 57.7 },
      end: { longitude: 11.97, latitude: 57.71 }
    });
    await Promise.resolve();
    expect(draft.start()).toBeNull();
    expect(draft.end()).toBeNull();
  });

  describe('photo questions', () => {
    const photoQuestion = (overrides: Partial<QuestionDTO> = {}) =>
      question({ type: 'PHOTO', params: { category: 'grocery_aisle' }, ...overrides });

    beforeEach(() => {
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:photo');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    });

    afterEach(() => vi.restoreAllMocks());

    it('lets a seeker ask for a photo of a subject, with what it must show, and nothing for the map', async () => {
      TestBed.tick();
      await Promise.resolve();
      previewQuestion.mockClear();

      choose('Photo');
      const subject = element.querySelector('#question-category') as HTMLSelectElement;
      expect(subject.closest('label')?.textContent).toContain('Subject');
      expect(subject.options).toHaveLength(PHOTO_SUBJECTS.length);
      subject.value = 'grocery_aisle';
      subject.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      expect(element.querySelector('.question-preview')?.textContent).toBe('“Send a photo: Grocery store aisle”');
      expect(element.querySelector('form')?.textContent).toContain('No zoom. Stand at the end of the aisle');
      await expectNoAxeViolations(element);

      TestBed.tick();
      expect(previewQuestion).not.toHaveBeenCalled();
      expect(element.textContent).not.toContain('Your position is not known yet');

      (element.querySelector('button[type=submit]') as HTMLButtonElement).click();
      expect(ask).toHaveBeenCalledWith({ type: 'PHOTO', category: 'grocery_aisle' });
    });

    it('asks the hider for the photo, not for a place', async () => {
      role.set('HIDER');
      questions.set([photoQuestion()]);
      fixture.detectChanges();

      expect(element.querySelector('.pending-question')?.textContent).toContain('No zoom. Stand at the end of the aisle');
      expect(element.querySelector('.visually-hidden[role=status]')?.textContent).toContain('No zoom. Stand at the end of the aisle');
      expect(element.querySelector('app-photo-answer')).not.toBeNull();
      expect(element.querySelector('.nearest-place')).toBeNull();
      await expectNoAxeViolations(element);
    });

    it('sends the photo as the answer, moving on to the history', async () => {
      document.body.append(element);
      role.set('HIDER');
      questions.set([photoQuestion()]);
      fixture.detectChanges();
      const photo = new Blob(['photo'], { type: 'image/jpeg' });

      fixture.debugElement.query(debug => debug.name === 'app-photo-answer')
        .triggerEventHandler('send', photo);
      await Promise.resolve();
      fixture.detectChanges();

      expect(answerWithPhoto).toHaveBeenCalledWith('q1', photo);
      expect(document.activeElement?.id).toBe('history-heading');
    });

    it('shows the photo in the history, and only for a question answered with one', async () => {
      questions.set([
        photoQuestion({ id: 'q2', status: 'EXPIRED' }),
        photoQuestion({ status: 'ANSWERED', answer: { choice: 'PHOTO' } })
      ]);
      fixture.detectChanges();
      TestBed.tick();
      await Promise.resolve();
      fixture.detectChanges();

      expect(element.querySelectorAll('app-question-photo')).toHaveLength(1);
      expect(element.querySelector('.question-history')?.textContent).toContain('Photo sent');
      await expectNoAxeViolations(element);
    });
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

  it('offers the hider their nearest place of the kind asked about, to answer with', async () => {
    role.set('HIDER');
    questions.set([question({ type: 'TENTACLES', params: { category: 'game_station', distanceMeters: 2000 } })]);
    fixture.detectChanges();
    expect(element.querySelector('.nearest-place')?.textContent).toContain('once your position is known');

    // Without a GPS position, measured from the hiding station
    hidingStation.set({ station: { stationId: 's2', name: 'Korsvägen', longitude: 11.987, latitude: 57.697 } });
    fixture.detectChanges();
    expect(element.querySelector('.nearest-place')?.textContent).toContain('Korsvägen');
    [...element.querySelectorAll('.nearest-place button')].find(button => button.textContent?.trim() === 'Answer Korsvägen')!
      .dispatchEvent(new Event('click'));
    fixture.detectChanges();
    expect((element.querySelector('#place-name') as HTMLInputElement).value).toBe('Korsvägen');
    await expectNoAxeViolations(element);
  });

  it('shows seekers and hiders the seekers\' nearest place, while waiting and afterwards', async () => {
    const params = { category: 'museums', nearest: { name: 'Röhsska', longitude: 11.98, latitude: 57.7, distanceMeters: 1240 } };
    const expected = 'The seekers\' nearest museum: Röhsska, 1.24 km away';

    for (const player of ['SEEKER', 'HIDER'] as const) {
      role.set(player);
      questions.set([question({ type: 'MEASURING', params })]);
      fixture.detectChanges();
      expect(element.querySelector('.pending-question')?.textContent).toContain(expected);
      expect(element.querySelector('[role=status]')?.textContent).toContain(expected);
      await expectNoAxeViolations(element);

      questions.set([question({ type: 'MEASURING', params, status: 'ANSWERED', answer: { choice: 'CLOSER' } })]);
      fixture.detectChanges();
      expect(element.querySelector('.question-history')?.textContent).toContain(expected);
    }
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
      ['Is your nearest zoo the same as ours?', 'The seekers\' nearest zoo is not known.', 'Not answered in time', 'Ada · 1 min ago'],
      ['Are you within 2.0 km of us?', 'Yes', 'Ada · 1 min ago']
    ]);
    await expectNoAxeViolations(element);
  });
});
