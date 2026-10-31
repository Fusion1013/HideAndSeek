import { ChangeDetectionStrategy, Component, DOCUMENT, inject, input } from '@angular/core';

import { ControlsPanelService } from '../controls/controls-panel.service';
import { injectFocusAfterRender } from '../shared/focus';
import { StationDistancesComponent } from '../station/station-distances.component';
import { ShapeService } from './shape.service';
import type { DrawMode, ShapeSummary } from './shape.service';

/** The panel covers the corner the shape menu sits in up to this width. */
const PANEL_COVERS_MENU = '(max-width: 700px)';

/** The Measure tab: draw lines, circles and thermometers on the map, pick one to adjust, and delete them; measure from the selected station. */
@Component({
  selector: 'app-measure-panel',
  imports: [StationDistancesComponent],
  template: `
    <section class="menu-content measure-tools panel-section" aria-labelledby="measure-heading">
      <div class="panel-heading">
        <h3 id="measure-heading" tabindex="-1">Measurement shapes</h3>
        <span>{{ shapes.shapeCount() }}</span>
      </div>
      <div class="panel-actions measure-actions">
        <button type="button" [attr.aria-pressed]="shapes.drawMode() === 'line'" (click)="toggleDrawMode('line')">Line</button>
        <button type="button" [attr.aria-pressed]="shapes.drawMode() === 'circle'" (click)="toggleDrawMode('circle')">Circle</button>
        <button type="button" [attr.aria-pressed]="shapes.drawMode() === 'thermometer'" (click)="toggleDrawMode('thermometer')">Thermometer</button>
      </div>
      @if (shapes.shapes().length > 0) {
        <ul class="shape-list" aria-label="Shapes on the map">
          @for (shape of shapes.shapes(); track shape.id) {
            <li>
              <button type="button" [id]="'shape-row-' + shape.id" [attr.aria-pressed]="isSelected(shape)" (click)="toggleShape(shape)">
                <span class="shape-swatch" aria-hidden="true" [style.background]="shape.strokeColor"></span>
                <span>{{ shape.label }}</span>&ngsp;
                <strong>{{ shape.measurement }}</strong>
              </button>
            </li>
          }
        </ul>
      }
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

    h3:focus {
      outline: none;
    }

    .shape-list {
      display: grid;
      max-height: 30dvh;
      margin: 0;
      padding: 0;
      overflow-y: auto;
      list-style: none;

      button {
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: 8px;
        width: 100%;
        min-height: 42px;
        padding: 4px 8px;
        border: 0;
        border-bottom: 1px solid var(--control-border);
        background: transparent;
        color: var(--control-ink);
        font: inherit;
        font-size: 14px;
        text-align: left;
        cursor: pointer;

        &:hover {
          background: var(--control-hover);
        }

        &[aria-pressed='true'] {
          background: var(--control-selected);
          color: var(--control-accent-strong);
        }
      }
    }

    .shape-swatch {
      width: 12px;
      height: 12px;
      border-radius: 50%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MeasurePanelComponent {
  /** Distances from a selected station; only Overview selects stations. */
  readonly stationDistances = input(true);

  protected readonly shapes = inject(ShapeService);
  private readonly controls = inject(ControlsPanelService);
  private readonly document = inject(DOCUMENT);
  private readonly focus = injectFocusAfterRender();

  protected isSelected(shape: ShapeSummary): boolean {
    return this.shapes.selectedShape()?.id === shape.id;
  }

  /** Picking the selected shape again deselects it. Otherwise focus moves on to the menu that opens for it. */
  protected toggleShape(shape: ShapeSummary): void {
    if (this.isSelected(shape)) {
      this.shapes.selectShape(null);
      return;
    }
    this.shapes.selectShape(shape.feature);
    if (this.document.defaultView?.matchMedia?.(PANEL_COVERS_MENU).matches) this.controls.open.set(false);
    this.focus('shape-menu-heading');
  }

  /** Picking the active mode again switches drawing off. */
  protected toggleDrawMode(mode: Exclude<DrawMode, null>): void {
    this.shapes.setDrawMode(this.shapes.drawMode() === mode ? null : mode);
  }
}
