import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ReachabilityPanelComponent } from './reachability-panel.component';
import { ShapeService } from './shape.service';
import type { DrawMode } from './shape.service';

/** The Measure tab: draw lines and circles on the map, and delete them; find the stations reachable in a time. */
@Component({
  selector: 'app-measure-panel',
  imports: [ReachabilityPanelComponent],
  template: `
    <section class="menu-content measure-tools" aria-label="Measure shapes">
      <div class="panel-heading">
        <span>Measurement shapes</span>
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
    <app-reachability-panel />
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
  protected readonly shapes = inject(ShapeService);

  /** Picking the active mode again switches drawing off. */
  protected toggleDrawMode(mode: Exclude<DrawMode, null>): void {
    this.shapes.setDrawMode(this.shapes.drawMode() === mode ? null : mode);
  }
}
