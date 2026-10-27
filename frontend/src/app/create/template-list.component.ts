import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { GameTemplateControllerService } from '../api/generated';
import { AccessTokenStore } from '../auth/access-token.store';

/** The templates this browser created (it holds their owner tokens), as links to edit them. */
@Component({
  selector: 'app-template-list',
  imports: [RouterLink],
  template: `
    @if (templates.hasValue() && templates.value().length > 0) {
      <nav class="panel-section" aria-labelledby="template-list-heading">
        <h3 id="template-list-heading" class="panel-heading">Your templates</h3>
        <ul class="template-links">
          @for (template of templates.value(); track template.id) {
            <li>
              <a [routerLink]="['/create', template.id]">{{ template.name }}</a>
              <span>{{ template.routes.length }} {{ template.routes.length === 1 ? 'route' : 'routes' }}</span>
            </li>
          }
        </ul>
      </nav>
    } @else if (templates.error()) {
      <p class="load-error" role="alert">Your templates could not be loaded.</p>
    }
  `,
  styleUrl: './create-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TemplateListComponent {
  private readonly templateApi = inject(GameTemplateControllerService);
  private readonly tokens = inject(AccessTokenStore);

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
