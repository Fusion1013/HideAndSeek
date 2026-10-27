import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';

import { StationDistancesComponent } from '../station/station-distances.component';
import { ShapeService } from './shape.service';
import type { DrawMode } from './shape.service';

/** The Measure tab: draw lines and circles on the map, and delete them; measure from the selected station. */
@Component({
  selector: 'app-measure-panel',
  imports: [StationDistancesComponent],
  template: `
    <section class="menu-content measure-tools panel-section" aria-labelledby="measure-heading">
      <div class="panel-heading">
        <h3 id="measure-heading">Measurement shapes</h3>
        <span>{{ shapes.shapeCount() }}</span>
      </div>
      <div class="panel-actions measure-actions">
        <button type="button" [attr.aria-pressed]="shapes.drawMode() === 'line'" (click)="toggleDrawMode('line')">Line</button>
        <button type="button" [attr.aria-pressed]="shapes.drawMode() === 'circle'" (click)="toggleDrawMode('circle')">Circle</button>
      </div>
      <div class="panel-actions measure-actions">
        <button type="button" [disabled]="shapes.selectedShapeCount() === 0" (click)="shapes.removeSelectedShapes()">Delete selected</button>
        <button type="button" [disabled]="shapes.shapeCount() === 0" (click)="shapes.clearShapes()">Delete all</button>
      </div>
    </section>
    @if (stationDistances()) {
      <app-station-distances />
    }
  `,
  styles: `
    :host {
      display: contents;
    }

    .measure-actions button {
      flex: 1;
      padding: 4px 6px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MeasurePanelComponent {
  /** Distances from a selected station; only Overview selects stations. */
  readonly stationDistances = input(true);

  protected readonly shapes = inject(ShapeService);

  /** Picking the active mode again switches drawing off. */
  protected toggleDrawMode(mode: Exclude<DrawMode, null>): void {
    this.shapes.setDrawMode(this.shapes.drawMode() === mode ? null : mode);
  }
}
