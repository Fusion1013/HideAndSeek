import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { formatApproximateDistance } from '../shared/format';
import { areaSize } from './area-bounds';
import { TemplateAreaLayerService } from './template-area-layer.service';
import { TemplateEditorService } from './template-editor.service';

/**
 * The play area: drawn on the map as a box (two clicks, opposite corners), or taken from the current view for
 * those not using a pointer.
 */
@Component({
  selector: 'app-template-area',
  template: `
    <fieldset class="template-group" [disabled]="!editor.canEdit() || editor.busy()">
      <legend class="panel-heading">
        Play area
        <span>{{ sizeLabel() }}</span>
      </legend>
      <div class="panel-actions">
        @if (areaLayer.drawing()) {
          <button type="button" aria-pressed="true" (click)="areaLayer.cancelDrawing()">Cancel drawing</button>
        } @else {
          <button type="button" aria-pressed="false" (click)="startDrawing()">
            {{ editor.area() ? 'Redraw on map' : 'Draw on map' }}
          </button>
        }
        <button type="button" (click)="useMapView()">Use map view</button>
        <button type="button" [disabled]="!editor.area()" (click)="showArea()">Show area</button>
      </div>
      <label class="check-field">
        <input type="checkbox" [checked]="square()" (change)="setSquare($event)">
        Square
      </label>
      @if (areaLayer.drawing()) {
        <p class="status-text" role="status">Click one corner on the map, then the opposite corner. Escape cancels.</p>
      }
    </fieldset>
  `,
  host: { '(document:keydown.escape)': 'areaLayer.cancelDrawing()' },
  styleUrl: './create-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TemplateAreaComponent {
  protected readonly editor = inject(TemplateEditorService);
  protected readonly areaLayer = inject(TemplateAreaLayerService);

  protected readonly square = signal(true);

  protected readonly sizeLabel = computed(() => {
    const area = this.editor.area();
    if (!area) return 'Not set';
    const { width, height } = areaSize(area);
    return `${formatApproximateDistance(width)} × ${formatApproximateDistance(height)}`;
  });

  protected startDrawing(): void {
    this.areaLayer.startDrawing(this.square(), area => this.editor.setArea(area));
  }

  protected useMapView(): void {
    const area = this.areaLayer.boundsFromView(this.square());
    if (area) this.editor.setArea(area);
  }

  protected showArea(): void {
    const area = this.editor.area();
    if (area) this.areaLayer.fitView(area);
  }

  protected setSquare(event: Event): void {
    this.square.set((event.target as HTMLInputElement).checked);
  }
}
