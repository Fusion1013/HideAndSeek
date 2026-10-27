import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { ControlsPanelService } from '../controls/controls-panel.service';
import { injectFocusAfterRender } from '../shared/focus';
import { LayersPanelComponent } from '../layer/layers-panel.component';
import { ExportImageDialogComponent } from './export-image-dialog.component';
import { HostGameComponent } from './host-game.component';
import { TemplateAreaComponent } from './template-area.component';
import { MAX_TEMPLATE_NAME_LENGTH, TemplateEditorService } from './template-editor.service';
import { TemplateListComponent } from './template-list.component';
import { TemplateRoutePickerComponent } from './template-route-picker.component';

/** Create mode: setting up a game template, new or (with a template ID in the address) existing. */
@Component({
  selector: 'app-create-panel',
  imports: [
    ExportImageDialogComponent, HostGameComponent, LayersPanelComponent, ReactiveFormsModule, RouterLink, TemplateAreaComponent,
    TemplateListComponent, TemplateRoutePickerComponent
  ],
  providers: [TemplateEditorService],
  template: `
    @switch (controls.activeMenu()) {
      @case ('template') {
        <section class="menu-content" aria-labelledby="template-heading">
          <div class="panel-heading">
            <h3 id="template-heading">{{ templateId() ? 'Edit template' : 'New template' }}</h3>
            @if (templateId()) {
              <a routerLink="/create">New template</a>
            }
          </div>

          <p class="status-text" role="status">{{ editor.notice() }}</p>

          @if (!templateId()) {
            <app-template-list />
          }

          @if (editor.status() === 'loading') {
            <p class="status-text">Loading the template…</p>
          } @else if (editor.loadError() === 'not-found') {
            <p class="load-error" role="alert">There is no template at this address. It may have been deleted.</p>
          } @else if (editor.loadError() === 'failed') {
            <p class="load-error" role="alert">The template could not be loaded.</p>
          } @else {
            @if (!editor.canEdit()) {
              <p class="status-text">This template was created in another browser, so it can only be viewed here.</p>
            }
            <!-- One notice for everything that waits on a save: exporting and hosting below -->
            @if (editor.dirty() && templateId()) {
              <p class="unsaved-notice">Unsaved changes. Save them before exporting an image or creating a game.</p>
            }

            <div class="control-field">
              <label for="template-name">Name</label>
              <input id="template-name" type="text" autocomplete="off" [maxLength]="maxNameLength"
                [formControl]="editor.name" [readOnly]="!editor.canEdit()"
                [attr.aria-invalid]="editor.name.touched && editor.name.invalid"
                [attr.aria-describedby]="editor.name.touched && editor.name.invalid ? 'template-name-error' : null">
              @if (editor.name.touched && editor.name.invalid) {
                <span id="template-name-error" class="field-error">Enter a name.</span>
              }
            </div>

            <app-template-area />
            <app-template-route-picker />

            @if (editor.error()) {
              <p class="load-error" role="alert">{{ editor.error() }}</p>
            }

            @if (editor.canEdit()) {
              <div class="panel-actions template-actions">
                <button type="button" class="primary-action" [disabled]="editor.busy()" (click)="editor.save()">
                  {{ editor.status() === 'saving' ? 'Saving…' : templateId() ? 'Save changes' : 'Create template' }}
                </button>
              </div>

              @if (templateId()) {
                @if (confirmingDelete()) {
                  <div class="confirm-box" role="group" aria-labelledby="delete-question">
                    <p id="delete-question">Delete this template? Games already created from it are kept.</p>
                    <div class="panel-actions">
                      <button type="button" class="danger-action" [disabled]="editor.busy()" (click)="editor.delete()">
                        {{ editor.status() === 'deleting' ? 'Deleting…' : 'Delete' }}
                      </button>
                      <button id="delete-keep" type="button" (click)="askToDelete(false)">Keep it</button>
                    </div>
                  </div>
                } @else {
                  <div class="panel-actions">
                    <button id="delete-ask" type="button" [disabled]="editor.busy()" (click)="askToDelete(true)">Delete template</button>
                  </div>
                }
              }
            }

            @if (templateId(); as templateId) {
              @if (editor.area(); as area) {
                <section class="panel-section" aria-labelledby="export-heading-panel">
                  <h3 id="export-heading-panel" class="panel-heading">Image of the play area</h3>
                  <div class="panel-actions">
                    <button type="button" [disabled]="editor.dirty()" (click)="exportDialog.open()">Export as PNG…</button>
                  </div>
                  <app-export-image-dialog #exportDialog [templateId]="templateId" [name]="editor.name.value" [area]="area" />
                </section>
              }
              <app-host-game [templateId]="templateId" [disabled]="editor.dirty()" />
            }
          }
        </section>
      }
      @case ('layers') {
        <app-layers-panel />
      }
    }
  `,
  styleUrl: './create-panel.scss',
  host: { class: 'mode-panel' },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class CreatePanelComponent {
  protected readonly controls = inject(ControlsPanelService);
  protected readonly editor = inject(TemplateEditorService);

  /** From the route /create/:templateId; undefined for a new template. */
  readonly templateId = input<string>();

  protected readonly confirmingDelete = signal(false);
  private readonly focus = injectFocusAfterRender();
  protected readonly maxNameLength = MAX_TEMPLATE_NAME_LENGTH;

  constructor() {
    // Each route has its own panel, so the ID is set once, before the first render
    effect(() => {
      const templateId = this.templateId();
      if (templateId) untracked(() => this.editor.load(templateId));
    });
  }

  /** Shows or hides the confirmation, moving focus to its safe choice or back to the button that opened it. */
  protected askToDelete(confirming: boolean): void {
    this.confirmingDelete.set(confirming);
    this.focus(confirming ? 'delete-keep' : 'delete-ask');
  }
}
