import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, viewChild } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';

import { QuestionControllerService } from '../api/generated';
import type { QuestionDTO } from '../api/generated';
import { GameSessionService } from './game-session.service';
import { blobUrl } from './photo-file';
import { questionText } from './questions';

/**
 * The photo that answered a question, to open full screen. It takes a player's token to get, which an image's own
 * request does not send, so it is fetched and shown from here.
 */
@Component({
  selector: 'app-question-photo',
  template: `
    @if (url(); as url) {
      <button type="button" class="photo-thumbnail" (click)="open()">
        <img [src]="url" [alt]="description()">
        <span>View full screen</span>
      </button>
      <dialog #viewer class="photo-viewer" [attr.aria-label]="description()">
        <button type="button" class="photo-close" (click)="close()">Close</button>
        <img [src]="url" [alt]="description()">
      </dialog>
    } @else if (photo.error()) {
      <p class="load-error" role="alert">The photo could not be loaded.</p>
      <div class="panel-actions">
        <button type="button" (click)="photo.reload()">Try again</button>
      </div>
    } @else {
      <p class="status-text">Loading the photo…</p>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 8px;
    }

    .photo-thumbnail {
      display: grid;
      width: 100%;
      gap: 4px;
      padding: 0;
      border: 0;
      background: none;
      color: var(--control-accent-strong);
      font: inherit;
      font-size: 14px;
      text-align: left;
      text-decoration: underline;
      cursor: pointer;

      img {
        display: block;
        width: 100%;
        max-height: 220px;
        border-radius: 4px;
        object-fit: cover;
      }

      &:focus-visible {
        outline: 2px solid var(--control-accent);
        outline-offset: 2px;
      }
    }

    // Over everything, the whole picture in as much of the screen as its shape allows
    .photo-viewer {
      width: 100vw;
      max-width: none;
      height: 100dvh;
      max-height: none;
      margin: 0;
      padding: 0;
      overflow: hidden;
      border: 0;
      background: #000000;

      img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: contain;
      }
    }

    .photo-close {
      position: absolute;
      top: max(12px, env(safe-area-inset-top));
      right: max(12px, env(safe-area-inset-right));
      min-height: 44px;
      padding: 0 16px;
      border: 1px solid #ffffff;
      border-radius: 5px;
      background: rgba(0, 0, 0, 0.7);
      color: #ffffff;
      font: inherit;
      cursor: pointer;

      &:focus-visible {
        outline: 3px solid #ffffff;
        outline-offset: 2px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class QuestionPhotoComponent {
  private readonly session = inject(GameSessionService);
  private readonly questionApi = inject(QuestionControllerService);
  private readonly viewer = viewChild<ElementRef<HTMLDialogElement>>('viewer');

  readonly question = input.required<QuestionDTO>();

  protected readonly photo = rxResource({
    params: () => {
      const gameId = this.session.game()?.id;
      return gameId ? { gameId, questionId: this.question().id } : undefined;
    },
    stream: ({ params }) => this.questionApi.getQuestionPhoto(params.gameId, params.questionId)
  });
  protected readonly url = blobUrl(() => this.photo.hasValue() ? this.photo.value() : null);
  protected readonly description = computed(() => `The hiders' answer to: ${questionText(this.question())}`);

  protected open(): void {
    this.viewer()?.nativeElement.showModal();
  }

  protected close(): void {
    this.viewer()?.nativeElement.close();
  }
}
