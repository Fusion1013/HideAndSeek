import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { injectFocusAfterRender } from '../shared/focus';
import { MAX_LATITUDE, ShapeService } from './shape.service';
import type { ShapeSummary } from './shape.service';

const MAX_STROKE_WIDTH = 12;

/** Over the map, while a measuring shape is selected: adjusts that shape, or deletes it. */
@Component({
  selector: 'app-shape-menu',
  template: `
    @if (shapes.selectedShape(); as shape) {
      <section class="shape-menu" aria-labelledby="shape-menu-heading" (keydown.escape)="close(shape)">
        <div class="shape-menu-heading">
          <h3 id="shape-menu-heading" tabindex="-1">{{ shape.label }}</h3>
          <span>{{ shape.measurement }}</span>
          <button type="button" class="shape-menu-close" [attr.aria-label]="'Close ' + shape.label" (click)="close(shape)">
            <span aria-hidden="true">×</span>
          </button>
        </div>
        @if (shape.sizeMeters !== null) {
          <label class="shape-field" for="shape-size">
            {{ shape.kind === 'circle' ? 'Radius' : 'Length' }} (meters)
            <input id="shape-size" type="number" min="1" step="50" [value]="rounded(shape.sizeMeters)" (change)="setSize(shape, $event)">
          </label>
        }
        @for (point of shape.points; track $index; let index = $index) {
          <fieldset class="shape-point">
            <legend>{{ point.label }}</legend>
            <label [for]="'shape-point-' + index + '-latitude'">
              Latitude
              <input [id]="'shape-point-' + index + '-latitude'" type="number" [min]="-maxLatitude" [max]="maxLatitude" step="0.0001"
                [value]="coordinate(point.latitude)" (change)="setPoint('latitude', index, $event)">
            </label>
            <label [for]="'shape-point-' + index + '-longitude'">
              Longitude
              <input [id]="'shape-point-' + index + '-longitude'" type="number" min="-180" max="180" step="0.0001"
                [value]="coordinate(point.longitude)" (change)="setPoint('longitude', index, $event)">
            </label>
          </fieldset>
        }
        <label class="shape-field" for="shape-color">
          Color
          <input id="shape-color" type="color" [value]="shape.strokeColor" (input)="setColor(shape, $event)">
        </label>
        <label class="shape-field" for="shape-width">
          Line width
          <input id="shape-width" type="number" min="1" [max]="maxStrokeWidth" step="1" [value]="shape.strokeWidth" (change)="setWidth(shape, $event)">
        </label>
        @if (shape.kind === 'circle') {
          <label class="shape-check">
            <input type="checkbox" [checked]="shape.filled" (change)="setFilled(shape, $event)">
            Filled
          </label>
        }
        <button type="button" class="shape-delete" (click)="delete(shape)">Delete</button>
      </section>
    }
  `,
  styles: `
    .shape-menu {
      display: grid;
      gap: 10px;
      padding: 12px 14px;
      border: 1px solid var(--control-border);
      border-radius: 6px;
      background: var(--control-surface);
      color: var(--control-ink);
      box-shadow: 0 2px 8px rgb(23 43 50 / 18%);
      font: 14px/1.3 system-ui, sans-serif;
    }

    .shape-menu-heading {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      column-gap: 8px;

      h3 {
        grid-column: 1;
        margin: 0;
        font-size: 14px;
        font-weight: 650;

        &:focus {
          outline: none;
        }
      }

      span:not([aria-hidden]) {
        grid-column: 1;
        color: var(--control-muted);
        font-size: 13px;
      }
    }

    .shape-menu-close {
      grid-column: 2;
      grid-row: 1 / span 2;
      width: 36px;
      height: 36px;
      padding: 0;
      border: 1px solid var(--control-field-border);
      border-radius: 5px;
      background: #ffffff;
      color: var(--control-ink);
      font-size: 20px;
      line-height: 1;
      cursor: pointer;

      &:hover {
        background: var(--control-hover);
      }
    }

    .shape-field {
      display: grid;
      grid-template-columns: 1fr 96px;
      align-items: center;
      gap: 8px;
      color: var(--control-muted);
      font-size: 13px;

      input {
        box-sizing: border-box;
        width: 100%;
        min-height: 36px;
        padding: 4px 6px;
        border: 1px solid var(--control-field-border);
        border-radius: 5px;
        background: #ffffff;
        color: var(--control-ink);
        font: inherit;
      }
    }

    .shape-point {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      min-width: 0;
      margin: 0;
      padding: 0;
      border: 0;

      legend {
        margin-bottom: 4px;
        padding: 0;
        font-size: 13px;
        font-weight: 650;
      }

      label {
        display: grid;
        min-width: 0;
        gap: 2px;
        color: var(--control-muted);
        font-size: 12px;
      }

      input {
        box-sizing: border-box;
        width: 100%;
        min-height: 36px;
        padding: 4px 6px;
        border: 1px solid var(--control-field-border);
        border-radius: 5px;
        background: #ffffff;
        color: var(--control-ink);
        font: inherit;
        font-size: 14px;
      }
    }

    .shape-check {
      display: flex;
      min-height: 36px;
      align-items: center;
      gap: 8px;
      color: var(--control-muted);
      font-size: 13px;
      cursor: pointer;

      input {
        width: 18px;
        height: 18px;
        margin: 0;
        accent-color: var(--control-accent);
      }
    }

    .shape-delete {
      min-height: 42px;
      border: 1px solid var(--control-danger);
      border-radius: 5px;
      background: #ffffff;
      color: var(--control-danger);
      font: inherit;
      cursor: pointer;

      &:hover {
        background: var(--control-danger-surface);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ShapeMenuComponent {
  protected readonly shapes = inject(ShapeService);
  private readonly focus = injectFocusAfterRender();

  protected readonly maxStrokeWidth = MAX_STROKE_WIDTH;
  protected readonly maxLatitude = MAX_LATITUDE;
  protected readonly rounded = Math.round;

  protected setSize(shape: ShapeSummary, event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!this.shapes.setShapeSize(shape.feature, input.valueAsNumber)) {
      input.value = String(Math.round(shape.sizeMeters ?? 0));
    }
  }

  /** About a meter on the ground. */
  protected coordinate(degrees: number): string {
    return degrees.toFixed(5);
  }

  /** From the shape as it is now, as another edit may not have been rendered yet. */
  protected setPoint(axis: 'latitude' | 'longitude', index: number, event: Event): void {
    const shape = this.shapes.selectedShape();
    const point = shape?.points[index];
    if (!shape || !point) return;
    const input = event.target as HTMLInputElement;
    const longitude = axis === 'longitude' ? input.valueAsNumber : point.longitude;
    const latitude = axis === 'latitude' ? input.valueAsNumber : point.latitude;
    if (!this.shapes.moveShapePoint(shape.feature, index, longitude, latitude)) {
      input.value = this.coordinate(point[axis]);
    }
  }

  protected setColor(shape: ShapeSummary, event: Event): void {
    this.shapes.restyleShape(shape.feature, { strokeColor: (event.target as HTMLInputElement).value });
  }

  protected setWidth(shape: ShapeSummary, event: Event): void {
    const input = event.target as HTMLInputElement;
    const width = input.valueAsNumber;
    if (Number.isFinite(width) && width >= 1 && width <= MAX_STROKE_WIDTH) {
      this.shapes.restyleShape(shape.feature, { strokeWidth: width });
    } else {
      input.value = String(shape.strokeWidth);
    }
  }

  protected setFilled(shape: ShapeSummary, event: Event): void {
    this.shapes.restyleShape(shape.feature, { filled: (event.target as HTMLInputElement).checked });
  }

  /** Focus goes back to the shape's row in the Measure tab, if that is open. */
  protected close(shape: ShapeSummary): void {
    this.shapes.selectShape(null);
    this.focus(`shape-row-${shape.id}`);
  }

  protected delete(shape: ShapeSummary): void {
    this.shapes.removeShape(shape.feature);
    this.focus('measure-heading');
  }
}
