import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { of, throwError } from 'rxjs';

import { QuestionControllerService } from '../api/generated';
import type { QuestionDTO } from '../api/generated';
import { expectNoAxeViolations } from '../../testing/axe';
import { GameSessionService } from './game-session.service';
import { QuestionPhotoComponent } from './question-photo.component';

const QUESTION: QuestionDTO = {
  id: 'q1',
  type: 'PHOTO',
  params: { category: 'tree' },
  status: 'ANSWERED',
  answer: { choice: 'PHOTO' },
  askedBy: 'p1',
  askedAt: '2026-10-25T12:00:00Z',
  deadlineAt: '2026-10-25T12:05:00Z'
};

describe('QuestionPhotoComponent', () => {
  let getQuestionPhoto: ReturnType<typeof vi.fn>;
  let fixture: ComponentFixture<QuestionPhotoComponent>;
  let element: HTMLElement;

  async function settle(): Promise<void> {
    TestBed.tick();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function create(): void {
    TestBed.configureTestingModule({
      imports: [QuestionPhotoComponent],
      providers: [
        { provide: QuestionControllerService, useValue: { getQuestionPhoto } },
        { provide: GameSessionService, useValue: { game: signal({ id: 'g1' }) } }
      ]
    });
    fixture = TestBed.createComponent(QuestionPhotoComponent);
    fixture.componentRef.setInput('question', QUESTION);
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    getQuestionPhoto = vi.fn(() => of(new Blob(['photo'], { type: 'image/jpeg' })));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:photo');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true; };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.open = false; };
  });

  afterEach(() => vi.restoreAllMocks());

  it('fetches the photo of the question and shows it, described', async () => {
    create();
    await settle();

    expect(getQuestionPhoto).toHaveBeenCalledWith('g1', 'q1');
    const thumbnail = element.querySelector('.photo-thumbnail img') as HTMLImageElement;
    expect(thumbnail.getAttribute('src')).toBe('blob:photo');
    expect(thumbnail.alt).toBe('The hiders\' answer to: Send a photo: A tree');
    await expectNoAxeViolations(element);
  });

  it('opens full screen and closes again', async () => {
    create();
    await settle();
    const viewer = element.querySelector('dialog') as HTMLDialogElement;
    expect(viewer.open).toBe(false);

    (element.querySelector('.photo-thumbnail') as HTMLButtonElement).click();
    expect(viewer.open).toBe(true);
    expect(viewer.querySelector('img')?.getAttribute('src')).toBe('blob:photo');
    await expectNoAxeViolations(element);

    (element.querySelector('.photo-close') as HTMLButtonElement).click();
    expect(viewer.open).toBe(false);
  });

  it('says when the photo could not be loaded, and tries again on request', async () => {
    getQuestionPhoto.mockReturnValueOnce(throwError(() => new Error('offline')));
    create();
    await settle();
    expect(element.querySelector('[role=alert]')?.textContent).toContain('could not be loaded');
    expect(element.querySelector('img')).toBeNull();
    await expectNoAxeViolations(element);

    (element.querySelector('.panel-actions button') as HTMLButtonElement).click();
    await settle();
    expect(element.querySelector('.photo-thumbnail img')).not.toBeNull();
  });
});
