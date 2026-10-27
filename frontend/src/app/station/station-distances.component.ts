import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { StationMeasurementService } from '../layer/station-measurement.service';
import type { StationMeasurePoint } from '../layer/station-measurement.service';
import { formatDistance } from '../shared/format';
import { StationTimetableService } from './station-timetable.service';

/** Part of the Measure tab: a radius around the selected station, and the distance from it to points on the map. */
@Component({
  selector: 'app-station-distances',
  template: `
    <section class="menu-content panel-section" aria-labelledby="station-distances-heading">
      <div class="panel-heading">
        <h3 id="station-distances-heading">Distances from a station</h3>
      </div>
      @if (timetable.stop(); as stop) {
        <p class="status-text">From: <strong>{{ stop.stopName || 'Unnamed station' }}</strong></p>
        <label class="control-field" for="station-radius">
          Radius (meters)
          <input id="station-radius" type="number" min="1" max="10000" step="25" [value]="measurement.radiusMeters()" (change)="setRadius($event)">
        </label>
        <div class="panel-actions">
          <button type="button" [attr.aria-pressed]="timetable.addingMeasurePoint()" (click)="timetable.addingMeasurePoint.set(true)">
            {{ timetable.addingMeasurePoint() ? 'Click map to add point' : 'Add distance point' }}
          </button>
          @if (timetable.addingMeasurePoint()) {
            <button type="button" (click)="timetable.addingMeasurePoint.set(false)">Cancel</button>
          }
        </div>
        @if (measurement.measurePoints().length > 0) {
          <ul class="station-measure-points" aria-label="Distance measurements">
            @for (point of measurement.measurePoints(); track point.id; let index = $index) {
              <li>
                <span>Point {{ index + 1 }}</span>
                <strong>{{ formatDistance(point.distanceMeters) }}</strong>
                <button type="button" [attr.aria-label]="'Remove distance point ' + (index + 1)" (click)="removePoint(point)">Remove</button>
              </li>
            }
          </ul>
        }
      } @else {
        <p class="status-text">Click a stop on the map to draw a radius around it and measure from it.</p>
      }
    </section>
  `,
  styles: `
    :host {
      display: contents;
    }

    .station-measure-points {
      display: grid;
      margin: 0;
      padding: 0;
      list-style: none;

      li {
        display: grid;
        grid-template-columns: 1fr auto auto;
        align-items: center;
        gap: 8px;
        min-height: 42px;
        border-bottom: 1px solid var(--control-border);
        font-size: 14px;
      }

      button {
        min-height: 36px;
        padding: 6px 8px;
        border: 1px solid var(--control-field-border);
        border-radius: 5px;
        background: #ffffff;
        color: var(--control-ink);
        font: inherit;
        cursor: pointer;

        &:hover {
          background: var(--control-hover);
        }
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StationDistancesComponent {
  protected readonly timetable = inject(StationTimetableService);
  protected readonly measurement = inject(StationMeasurementService);

  protected readonly formatDistance = formatDistance;

  protected setRadius(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!this.measurement.setRadiusMeters(input.valueAsNumber)) {
      input.value = String(this.measurement.radiusMeters());
    }
  }

  protected removePoint(point: StationMeasurePoint): void {
    this.measurement.removeMeasurePoint(point.id);
  }
}
