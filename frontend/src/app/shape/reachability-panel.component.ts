import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { LayerService } from '../layer/layer.service';
import { StationTimetableService } from '../station/station-timetable.service';
import { ReachabilityRouteCardComponent } from './reachability-route-card.component';
import { ReachabilityRoutePickerComponent } from './reachability-route-picker.component';
import { ReachabilityRouteService } from './reachability-route.service';
import { MAX_REACHABILITY_MINUTES, REACHABILITY_COLORS, ReachabilityService } from './reachability.service';

/** The Reachable tab: which stations can be reached from a station, leaving at a time, within a duration. */
@Component({
  selector: 'app-reachability-panel',
  imports: [ReactiveFormsModule, ReachabilityRoutePickerComponent, ReachabilityRouteCardComponent],
  template: `
    <section class="menu-content reachability-tools" aria-labelledby="reachability-heading">
      <div class="panel-heading">
        <h3 id="reachability-heading">Reachable stations</h3>
      </div>
      <p class="status-text">
        From:
        <strong>{{ reachability.origin()?.stopName || (reachability.picking() ? 'click a stop on the map' : 'no station chosen') }}</strong>
      </p>
      <div class="panel-actions reachability-actions">
        <button type="button" [attr.aria-pressed]="reachability.picking()" (click)="reachability.picking.set(!reachability.picking())">
          {{ reachability.picking() ? 'Cancel picking' : 'Pick on map' }}
        </button>
        @if (selectedStop(); as stop) {
          <button type="button" (click)="reachability.setOrigin(stop)">Use selected station</button>
        }
      </div>
      @if (reachability.picking()) {
        <p class="status-text" role="status">Click a stop on the map.</p>
        @if (!stopsShown()) {
          <div class="panel-actions">
            <button type="button" (click)="showStops()">Show stops on the map</button>
          </div>
        }
      }

      <form class="reachability-form" [formGroup]="form" (ngSubmit)="calculate()">
        <label class="control-field" for="reachability-date">
          Date
          <input id="reachability-date" type="date" formControlName="date" required>
        </label>
        <label class="control-field" for="reachability-start">
          Start time
          <input id="reachability-start" type="time" formControlName="startTime" required>
        </label>
        <label class="control-field" for="reachability-duration">
          Duration (minutes)
          <input id="reachability-duration" type="number" min="1" [max]="maxMinutes" step="5" formControlName="durationMinutes" required>
        </label>
        <div class="panel-actions reachability-actions">
          <button type="submit" [disabled]="!reachability.origin() || form.invalid || reachability.loading()">Calculate</button>
          <button type="button" [disabled]="!reachability.origin()" (click)="reachability.clear()">Clear</button>
        </div>
      </form>

      @if (reachability.loading()) {
        <p class="status-text" role="status">Calculating reachable stations...</p>
      } @else if (reachability.error(); as error) {
        <p class="status-text" role="alert">{{ error }}</p>
      } @else if (reachability.hasResult()) {
        <p class="status-text" role="status">{{ reachability.stations().length }} stations reachable.</p>
        <ul class="reachability-legend" aria-label="Legend">
          <li>
            <span class="legend-marker likely" [style.background-color]="colors.likely" aria-hidden="true"></span>
            Likely <strong>{{ reachability.likelyCount() }}</strong>
          </li>
          <li>
            <span class="legend-marker unlikely" [style.border-color]="colors.unlikely" aria-hidden="true"></span>
            Unlikely, tight transfers <strong>{{ reachability.unlikelyCount() }}</strong>
          </li>
        </ul>
        <p class="status-text">
          Walking at 6 km/h in a straight line. Likely stations leave 3 minutes for every change.
        </p>

        <app-reachability-route-picker />
        @if (routes.loading()) {
          <p class="status-text" role="status">Finding the routes...</p>
        } @else if (routes.error(); as error) {
          <p class="status-text" role="alert">{{ error }}</p>
        }
        @if (routes.routes().length > 0) {
          <div class="route-cards" aria-label="Routes" role="region">
            @for (shown of routes.routes(); track shown.route.stopId) {
              <app-reachability-route-card [route]="shown.route" [color]="shown.color"
                [startSeconds]="routes.startSeconds()" (zoom)="routes.zoomTo(shown.route)" />
            }
          </div>
        }
      }
    </section>
  `,
  styles: `
    :host {
      display: contents;
    }

    .reachability-form {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .reachability-form .panel-actions {
      grid-column: 1 / -1;
    }

    .reachability-actions button {
      flex: 1;
      padding: 4px 6px;
    }

    .route-cards {
      display: grid;
      gap: 12px;
    }

    .reachability-legend {
      display: grid;
      gap: 4px;
      margin: 0;
      padding: 0;
      list-style: none;
      font-size: 13px;

      li {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      strong {
        margin-left: auto;
      }
    }

    .legend-marker {
      box-sizing: border-box;
      width: 14px;
      height: 14px;
      border-radius: 50%;

      &.likely {
        border: 2px solid #ffffff;
        box-shadow: 0 0 0 1px var(--control-field-border);
      }

      &.unlikely {
        border: 3px solid;
        background: #ffffff;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReachabilityPanelComponent {
  protected readonly reachability = inject(ReachabilityService);
  protected readonly routes = inject(ReachabilityRouteService);
  private readonly timetable = inject(StationTimetableService);
  private readonly layers = inject(LayerService);

  /** Stops can only be picked where they are drawn. */
  protected readonly stopsShown = computed(() => this.layers.visibleLayerIds().has('stops'));

  protected readonly colors = REACHABILITY_COLORS;
  protected readonly maxMinutes = MAX_REACHABILITY_MINUTES;

  /** The station selected on the Station tab, offered when it is not already the origin. */
  protected readonly selectedStop = computed(() => {
    const stop = this.timetable.stop();
    return stop && stop.stopId !== this.reachability.origin()?.stopId ? stop : null;
  });

  protected readonly form = new FormGroup({
    date: new FormControl(currentDate(), { nonNullable: true, validators: [Validators.required] }),
    startTime: new FormControl(currentTime(), { nonNullable: true, validators: [Validators.required] }),
    durationMinutes: new FormControl(60, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1), Validators.max(MAX_REACHABILITY_MINUTES)]
    })
  });

  protected showStops(): void {
    this.layers.setLayerVisibility('stops', true);
  }

  protected calculate(): void {
    if (this.form.invalid) return;
    const { date, startTime, durationMinutes } = this.form.getRawValue();
    this.reachability.calculate(date, startTime, durationMinutes);
  }
}

/** Today as "YYYY-MM-DD", for the date field. */
function currentDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** The time now as "HH:MM", for the start time field. */
function currentTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}
