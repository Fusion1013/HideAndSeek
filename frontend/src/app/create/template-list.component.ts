import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { GameTemplateControllerService } from '../api/generated';
import { AccessTokenStore } from '../auth/access-token.store';
import { ControlsPanelService } from '../controls/controls-panel.service';

/** The templates this browser created (it holds their owner tokens), as links to edit them. */
@Component({
  selector: 'app-template-list',
  imports: [RouterLink],
  template: `
    @if (templates.error()) {
      <p class="load-error" role="alert">Your templates could not be loaded.</p>
    } @else if (templates.isLoading()) {
      <p class="status-text">Loading your templates…</p>
    } @else if (templates.hasValue() && templates.value().length > 0) {
      <nav aria-labelledby="template-list-heading">
        <ul class="template-links">
          @for (template of templates.value(); track template.id) {
            <li>
              <!-- Opens the template in the Template tab -->
              <a [routerLink]="['/create', template.id]" (click)="controls.select('template')">{{ template.name }}</a>
              <span>{{ template.routes.length }} {{ template.routes.length === 1 ? 'route' : 'routes' }}</span>
            </li>
          }
        </ul>
      </nav>
    } @else {
      <p class="status-text">No templates yet. The templates you create in this browser are listed here.</p>
    }
  `,
  styleUrl: './create-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TemplateListComponent {
  private readonly templateApi = inject(GameTemplateControllerService);
  private readonly tokens = inject(AccessTokenStore);
  protected readonly controls = inject(ControlsPanelService);

  private readonly ids = this.tokens.ids('templates');

  protected readonly templates = rxResource({
    params: () => this.ids.length > 0 ? this.ids : undefined,
    stream: ({ params: ids }) => this.templateApi.getTemplates(ids)
  });

  constructor() {
    // Templates deleted elsewhere: their tokens are of no use any more
    effect(() => {
      if (!this.templates.hasValue()) return;
      const existing = new Set(this.templates.value().map(template => template.id));
      for (const id of this.ids) {
        if (!existing.has(id)) this.tokens.remove('templates', id);
      }
    });
  }
}
