import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { ReachabilityLegDTO } from '../api/generated';
import type { ReachabilityRouteDTO } from '../api/generated';
import { formatClock, formatDistance, formatDuration } from '../shared/format';
import { routeTypeLabel } from '../transit/route-labels';

/** Time to change that the search counts as enough; less is a tight change. */
const ENOUGH_TRANSFER_SECONDS = 3 * 60;

type Step =
  | { kind: 'walk'; leg: ReachabilityLegDTO; from: string; to: string }
  | { kind: 'ride'; leg: ReachabilityLegDTO; name: string; from: string; to: string; passed: number }
  | { kind: 'wait'; seconds: number; at: string; tight: boolean };

/** The quickest route to one station, step by step: walks, rides, and the waits and changes between them. */
@Component({
  selector: 'app-reachability-route-card',
  template: `
    <article class="route-card" [attr.aria-labelledby]="headingId()" [style.border-left-color]="color()">
      <div class="route-heading">
        <h4 [id]="headingId()">{{ route().stopName || route().stopId }}</h4>
        <button type="button" (click)="zoom.emit()" [attr.aria-label]="'Show the route to ' + (route().stopName || route().stopId) + ' on the map'">
          Show on map
        </button>
      </div>
      <p class="route-summary">
        Arrive <strong>{{ clock(route().arrivalSeconds) }}</strong> · {{ duration(route().arrivalSeconds) }}
        · {{ changesText() }}
        @if (walkedMeters() > 0) {
          · {{ distance(walkedMeters()) }} on foot
        }
      </p>
      @if (!route().likely) {
        <p class="tight-note">Only with tight changes; there is no route with {{ enoughMinutes }} minutes at every change in time.</p>
      }

      @if (steps().length === 0) {
        <p class="status-text">This is the station travelled from.</p>
      } @else {
        <ol class="steps">
          @for (step of steps(); track $index) {
            @switch (step.kind) {
              @case ('walk') {
                <li class="step walk-step">
                  <span class="step-icon" [style.border-color]="color()" aria-hidden="true"></span>
                  <div>
                    <p class="step-title">Walk {{ distance(step.leg.distanceMeters) }}, {{ duration(step.leg.arrivalSeconds - step.leg.departureSeconds) }}</p>
                    <p class="step-detail">
                      {{ clock(step.leg.departureSeconds) }} {{ step.from }} → {{ clock(step.leg.arrivalSeconds) }} {{ step.to }}
                    </p>
                  </div>
                </li>
              }
              @case ('wait') {
                <li class="step wait-step">
                  <span class="step-icon" aria-hidden="true"></span>
                  <p class="step-detail">
                    Wait {{ duration(step.seconds) }} at {{ step.at }}
                    @if (step.tight) {
                      · <strong class="tight-note">tight change</strong>
                    }
                  </p>
                </li>
              }
              @case ('ride') {
                <li class="step ride-step">
                  <span class="step-icon" [style.background-color]="color()" aria-hidden="true"></span>
                  <div>
                    <p class="step-title">
                      {{ step.name }}
                      @if (step.leg.headsign) {
                        towards {{ step.leg.headsign }}
                      }
                    </p>
                    @if (step.leg.agencyName) {
                      <p class="step-detail">{{ step.leg.agencyName }}</p>
                    }
                    <p class="step-detail">
                      {{ clock(step.leg.departureSeconds) }} board at {{ step.from }}<br>
                      {{ clock(step.leg.arrivalSeconds) }} get off at {{ step.to }}
                    </p>
                    <details>
                      <summary>
                        {{ duration(step.leg.arrivalSeconds - step.leg.departureSeconds) }},
                        {{ step.passed }} {{ step.passed === 1 ? 'stop' : 'stops' }}, {{ distance(step.leg.distanceMeters) }}
                      </summary>
                      <ol class="passed-stops">
                        @for (stop of step.leg.stops; track $index) {
                          <li>
                            <span class="stop-time">{{ clock(stop.departureSeconds ?? stop.arrivalSeconds) }}</span>
                            {{ stop.stopName || stop.stopId }}
                          </li>
                        }
                      </ol>
                    </details>
                  </div>
                </li>
              }
            }
          }
        </ol>
      }
    </article>
  `,
  styles: `
    .route-card {
      display: grid;
      gap: 6px;
      padding: 8px 0 8px 10px;
      border-left: 4px solid;
      font-size: 13px;
    }

    .route-heading {
      display: flex;
      align-items: center;
      gap: 8px;

      h4 {
        flex: 1;
        min-width: 0;
        margin: 0;
        font-size: 14px;
        overflow-wrap: anywhere;
      }

      button {
        flex: none;
        padding: 4px 8px;
      }
    }

    p {
      margin: 0;
    }

    .route-summary {
      color: var(--control-ink);
    }

    .tight-note {
      color: var(--control-warning-ink);
    }

    .steps {
      display: grid;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .step {
      display: grid;
      grid-template-columns: 14px 1fr;
      gap: 8px;
      align-items: start;
    }

    .step-icon {
      box-sizing: border-box;
      width: 14px;
      height: 14px;
      margin-top: 2px;
      border-radius: 50%;
    }

    .walk-step .step-icon {
      border: 3px dotted;
    }

    .wait-step .step-icon {
      border: 2px solid var(--control-muted);
      background: #ffffff;
    }

    .ride-step .step-icon {
      border-radius: 3px;
    }

    .step-title {
      font-weight: 600;
    }

    .step-detail {
      color: var(--control-muted);
    }

    details {
      margin-top: 2px;
      color: var(--control-muted);
    }

    summary {
      cursor: pointer;
    }

    .passed-stops {
      margin: 4px 0 0;
      padding: 0;
      list-style: none;

      li {
        display: flex;
        gap: 8px;
      }
    }

    .stop-time {
      flex: none;
      font-variant-numeric: tabular-nums;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReachabilityRouteCardComponent {
  readonly route = input.required<ReachabilityRouteDTO>();
  readonly color = input.required<string>();
  /** Seconds after midnight that the search starts. */
  readonly startSeconds = input.required<number>();
  readonly zoom = output();

  protected readonly enoughMinutes = ENOUGH_TRANSFER_SECONDS / 60;
  protected readonly distance = formatDistance;
  protected readonly duration = formatDuration;

  protected readonly headingId = computed(() => `reachability-route-${this.route().stopId}`);

  protected readonly steps = computed<Step[]>(() => {
    const steps: Step[] = [];
    let previous: ReachabilityLegDTO | undefined;
    for (const leg of this.route().legs) {
      const first = leg.stops[0];
      const last = leg.stops[leg.stops.length - 1];
      const from = first?.stopName || first?.stopId || '';
      const to = last?.stopName || last?.stopId || '';
      if (leg.mode === ReachabilityLegDTO.ModeEnum.Ride) {
        const waited = leg.departureSeconds - (previous?.arrivalSeconds ?? 0);
        // At the start the traveller is already waiting, so no change there is tight
        const tight = previous !== undefined && waited < ENOUGH_TRANSFER_SECONDS;
        if (waited >= 60 || tight) steps.push({ kind: 'wait', seconds: waited, at: from, tight });
        steps.push({ kind: 'ride', leg, name: rideName(leg), from, to, passed: Math.max(leg.stops.length - 1, 0) });
      } else {
        steps.push({ kind: 'walk', leg, from, to });
      }
      previous = leg;
    }
    return steps;
  });

  protected readonly changesText = computed(() => {
    const rides = this.route().legs.filter(leg => leg.mode === ReachabilityLegDTO.ModeEnum.Ride).length;
    if (rides === 0) return 'on foot';
    const changes = rides - 1;
    return changes === 0 ? 'no changes' : changes === 1 ? '1 change' : `${changes} changes`;
  });

  protected readonly walkedMeters = computed(() => this.route().legs
    .filter(leg => leg.mode === ReachabilityLegDTO.ModeEnum.Walk)
    .reduce((sum, leg) => sum + leg.distanceMeters, 0));

  protected clock(seconds: number | undefined): string {
    return seconds === undefined ? '' : formatClock(this.startSeconds() + seconds);
  }
}

/** "Subway 19", "Bus 433", or the mode alone when the route has no name. */
function rideName(leg: ReachabilityLegDTO): string {
  const name = leg.routeShortName || leg.routeLongName;
  const mode = leg.routeType ? routeTypeLabel(leg.routeType) : 'Ride';
  return name ? `${mode} ${name}` : mode;
}
