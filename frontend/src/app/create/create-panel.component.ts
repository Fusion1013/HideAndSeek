import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { ControlsPanelService } from '../controls/controls-panel.service';
import { injectFocusAfterRender } from '../shared/focus';
import { LayersPanelComponent } from '../layer/layers-panel.component';
import { ExportImageDialogComponent } from './export-image-dialog.component';
import { HostGameComponent } from './host-game.component';
import { OpenTemplateComponent } from './open-template.component';
import { TemplateAreaComponent } from './template-area.component';
import { TemplateLinkComponent } from './template-link.component';
import { MAX_TEMPLATE_NAME_LENGTH, TemplateEditorService } from './template-editor.service';
import { TemplateListComponent } from './template-list.component';
import { TemplateQuestionsComponent } from './template-questions.component';
import { TemplateRoutePickerComponent } from './template-route-picker.component';

/**
 * Create mode: setting up a game template, new or (with a template ID in the address) existing, in the Template
 * tab; sharing a saved one as a link, an image or a game in the Share tab; and the templates this browser made, or
 * opening one someone shared.
 */
@Component({
  selector: 'app-create-panel',
  imports: [
    ExportImageDialogComponent, HostGameComponent, LayersPanelComponent, OpenTemplateComponent, ReactiveFormsModule, RouterLink,
    TemplateAreaComponent, TemplateLinkComponent, TemplateListComponent, TemplateQuestionsComponent, TemplateRoutePickerComponent
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
            <app-template-questions />

            @if (editor.error()) {
              <p class="load-error" role="alert">{{ editor.error() }}</p>
            }

            @if (editor.canEdit()) {
              @if (editor.dirty() && templateId()) {
                <p class="unsaved-notice">Unsaved changes. Exporting and creating a game use the saved template.</p>
              }
              <div class="panel-actions">
                <button type="button" class="primary-action" [disabled]="editor.busy()" (click)="editor.save()">
                  {{ editor.status() === 'saving' ? 'Saving…' : templateId() ? 'Save changes' : 'Create template' }}
                </button>
              </div>

              <!-- Last, away from the everyday actions, as it cannot be undone -->
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
          }
        </section>
      }
      @case ('share') {
        <!-- Offered once the template is saved and loaded (see the constructor) -->
        @if (templateId(); as templateId) {
          <section class="menu-content" aria-labelledby="share-heading">
            <div class="panel-heading">
              <h3 id="share-heading">Share the template</h3>
              <span>{{ editor.name.value }}</span>
            </div>
            @if (editor.dirty()) {
              <div class="unsaved-notice">
                <p>The template has unsaved changes. Save them first, so the image, the game and anyone you share it with get them.</p>
                <div class="panel-actions">
                  <button type="button" (click)="controls.select('template')">Back to the template</button>
                </div>
              </div>
            }
            <app-template-link [templateId]="templateId" />
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
          </section>
        }
      }
      @case ('templates') {
        <section class="menu-content" aria-labelledby="template-list-heading">
          <div class="panel-heading">
            <h3 id="template-list-heading">Your templates</h3>
            <a routerLink="/create" (click)="controls.select('template')">New template</a>
          </div>
          <app-template-list />
          <app-open-template />
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

    // Sharing (an image, a game) needs a saved template that has loaded
    effect(() => this.controls.setAvailable('share',
      !!this.templateId() && this.editor.status() !== 'loading' && this.editor.loadError() === null));
    inject(DestroyRef).onDestroy(() => this.controls.setAvailable('share', false));
  }

  /** Shows or hides the confirmation, moving focus to its safe choice or back to the button that opened it. */
  protected askToDelete(confirming: boolean): void {
    this.confirmingDelete.set(confirming);
    this.focus(confirming ? 'delete-keep' : 'delete-ask');
  }
}
