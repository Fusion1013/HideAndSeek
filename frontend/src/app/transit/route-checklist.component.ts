import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { routeColor } from '../layer/route-shapes-layer.service';

/** A route in a checklist: its name, and a short note on it (such as "outside the area"). */
export interface ChecklistRoute {
  routeId: string;
  label: string;
  note?: string;
}

/**
 * Routes with their map colors, each with a checkbox to choose it; or, read-only, just the routes. Scrolls
 * within its own height. Shared by the Transit tab and the template editor.
 */
@Component({
  selector: 'app-route-checklist',
  template: `
    @if (readOnly()) {
      <!-- Focusable so it can be scrolled with the keyboard -->
      <ul class="route-checklist" [id]="listId()" [attr.aria-label]="label()" tabindex="0">
        @for (route of routes(); track route.routeId) {
          <li class="route-row">
            <span class="layer-swatch" [style.background-color]="color(route.routeId)" aria-hidden="true"></span>
            <span class="route-name">
              {{ route.label }}
              @if (route.note) {
                <span class="route-note">{{ route.note }}</span>
              }
            </span>
          </li>
        } @empty {
          <li class="status-text">{{ emptyText() }}</li>
        }
      </ul>
    } @else {
      <ul class="route-checklist" [id]="listId()" [attr.aria-label]="label()">
        @for (route of routes(); track route.routeId) {
          <li>
            <label class="route-row">
              <input type="checkbox" [checked]="chosen().has(route.routeId)" (change)="onChange(route.routeId, $event)">
              <span class="layer-swatch" [style.background-color]="color(route.routeId)" aria-hidden="true"></span>
              <span class="route-name">
                {{ route.label }}
                @if (route.note) {
                  <span class="route-note">{{ route.note }}</span>
                }
              </span>
            </label>
          </li>
        } @empty {
          <li class="status-text">{{ emptyText() }}</li>
        }
      </ul>
    }
  `,
  styles: `
    :host {
      display: contents;
    }

    .route-checklist {
      max-height: 40dvh;
      // Room for the checkbox focus outline, which would otherwise be clipped by the scroll container
      margin: 0 -6px;
      padding: 0 6px;
      overflow-y: auto;
      overscroll-behavior: contain;
      list-style: none;
    }

    .route-row {
      display: flex;
      min-height: 32px;
      align-items: center;
      gap: 10px;
      border-bottom: 1px solid var(--control-border);
      color: var(--control-ink);
      font-size: 14px;
    }

    label.route-row {
      cursor: pointer;
    }

    input {
      flex: none;
      width: 18px;
      height: 18px;
      margin: 0;
      accent-color: var(--control-accent);
    }

    .route-name {
      min-width: 0;
      padding-block: 4px;
      overflow-wrap: anywhere;
    }

    .route-note {
      display: block;
      color: var(--control-warning-ink);
      font-size: 12px;
    }

    .status-text {
      padding-block: 6px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RouteChecklistComponent {
  readonly routes = input.required<readonly ChecklistRoute[]>();
  readonly chosen = input<ReadonlySet<string>>(new Set());
  /** The list's accessible name. */
  readonly label = input.required<string>();
  readonly listId = input<string | null>(null);
  readonly readOnly = input(false);
  readonly emptyText = input('No routes.');

  /** A route ticked or unticked. */
  readonly toggled = output<{ routeId: string; chosen: boolean }>();

  protected readonly color = routeColor;

  protected onChange(routeId: string, event: Event): void {
    this.toggled.emit({ routeId, chosen: (event.target as HTMLInputElement).checked });
  }
}
