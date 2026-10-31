import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { ControlsPanelService } from '../controls/controls-panel.service';

const TEMPLATE_ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** The template ID in what was pasted, on its own or as part of a link; null if there is none. */
export function templateIdIn(text: string): string | null {
  return TEMPLATE_ID.exec(text)?.[0].toLowerCase() ?? null;
}

/** Opens a template someone shared, from its ID or link. */
@Component({
  selector: 'app-open-template',
  imports: [ReactiveFormsModule],
  template: `
    <form class="panel-section" [formGroup]="form" (ngSubmit)="open()" aria-labelledby="open-template-heading">
      <h3 id="open-template-heading" class="panel-heading">Open a shared template</h3>
      <div class="control-field">
        <label for="open-template">Template ID or link</label>
        <input id="open-template" type="text" autocomplete="off" spellcheck="false" formControlName="reference"
          [attr.aria-invalid]="invalid()" [attr.aria-describedby]="invalid() ? 'open-template-error' : null">
        @if (invalid()) {
          <span id="open-template-error" class="field-error" role="alert">That is not a template ID or link.</span>
        }
      </div>
      <div class="panel-actions">
        <button type="submit">Open</button>
      </div>
    </form>
  `,
  styleUrl: './create-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OpenTemplateComponent {
  private readonly router = inject(Router);
  private readonly controls = inject(ControlsPanelService);

  protected readonly form = new FormGroup({ reference: new FormControl('', { nonNullable: true }) });
  protected readonly invalid = signal(false);

  protected open(): void {
    const templateId = templateIdIn(this.form.controls.reference.value);
    this.invalid.set(templateId === null);
    if (templateId === null) return;
    this.controls.select('template');
    void this.router.navigate(['/create', templateId]);
  }
}
