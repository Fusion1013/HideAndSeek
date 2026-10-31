import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import { blobUrl, shrunkPhoto } from './photo-file';

/** Taking or choosing the photo that answers a question, and looking at it before it goes: an answer is final. */
@Component({
  selector: 'app-photo-answer',
  template: `
    <input #picker type="file" accept="image/*" hidden (change)="choose($event)">
    @if (previewUrl(); as url) {
      <img class="photo-preview" [src]="url" alt="The photo you are about to send">
    }
    <div class="panel-actions">
      <button type="button" [class.primary-action]="!photo()" [disabled]="disabled()" (click)="picker.click()">
        {{ photo() ? 'Choose another' : 'Take or choose a photo' }}
      </button>
      @if (photo(); as chosen) {
        <button type="button" class="primary-action" [disabled]="disabled()" (click)="send.emit(chosen)">Send photo</button>
      }
    </div>
    @if (error()) {
      <p class="load-error" role="alert">{{ error() }}</p>
    }
    <p class="status-text" role="status">{{ preparing() ? 'Preparing the photo…' : '' }}</p>
  `,
  styles: `
    :host {
      display: grid;
      width: 100%;
      gap: 8px;
    }

    .photo-preview {
      display: block;
      width: 100%;
      max-height: 40dvh;
      border-radius: 4px;
      object-fit: contain;
      background: #17232b;
    }

    p:empty {
      display: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PhotoAnswerComponent {
  /** Something else is on its way to the server. */
  readonly busy = input(false);
  readonly send = output<Blob>();

  protected readonly photo = signal<Blob | null>(null);
  protected readonly preparing = signal(false);
  protected readonly error = signal('');
  protected readonly previewUrl = blobUrl(this.photo);
  protected readonly disabled = computed(() => this.busy() || this.preparing());

  protected async choose(event: Event): Promise<void> {
    const picker = event.target as HTMLInputElement;
    const picture = picker.files?.[0];
    // Choosing the same file again must count as a choice too
    picker.value = '';
    if (!picture) return;
    this.preparing.set(true);
    this.error.set('');
    try {
      this.photo.set(await shrunkPhoto(picture));
    } catch {
      this.photo.set(null);
      this.error.set('That file could not be read as a photo. Try another.');
    }
    this.preparing.set(false);
  }
}
