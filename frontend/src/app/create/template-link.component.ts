import { ChangeDetectionStrategy, Component, computed, DOCUMENT, inject, input, signal } from '@angular/core';

/** The template's link and ID, for the player to pass on. */
@Component({
  selector: 'app-template-link',
  template: `
    <section class="panel-section" aria-labelledby="share-link-heading">
      <h3 id="share-link-heading" class="panel-heading">Share with others</h3>
      <p class="status-text">Anyone with the link or ID can view this template and play it. Only its creator can change it.</p>
      <div class="control-field">
        <label for="template-link">Link</label>
        <input id="template-link" type="text" readonly [value]="link()" (focus)="select($event)">
      </div>
      <div class="control-field">
        <label for="template-share-id">ID</label>
        <input id="template-share-id" type="text" readonly [value]="templateId()" (focus)="select($event)">
      </div>
      <div class="panel-actions">
        <button type="button" (click)="copy(link(), 'Link')">Copy link</button>
        <button type="button" (click)="copy(templateId(), 'ID')">Copy ID</button>
      </div>
      <p class="status-text" role="status">{{ copyStatus() }}</p>
    </section>
  `,
  styleUrl: './create-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TemplateLinkComponent {
  private readonly document = inject(DOCUMENT);

  readonly templateId = input.required<string>();

  protected readonly link = computed(() =>
    `${this.document.defaultView?.location.origin ?? ''}/create/${this.templateId()}`);
  protected readonly copyStatus = signal('');

  /** Selected on arrival, for copying by hand where the browser will not let the page do it. */
  protected select(event: Event): void {
    (event.target as HTMLInputElement).select();
  }

  protected async copy(text: string, label: string): Promise<void> {
    try {
      await this.document.defaultView?.navigator.clipboard.writeText(text);
      this.copyStatus.set(`${label} copied.`);
    } catch {
      this.copyStatus.set(`It could not be copied. Select the ${label === 'ID' ? 'ID' : 'link'} above and copy it by hand.`);
    }
  }
}
