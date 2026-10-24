import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { LayerService } from './layer.service';
import type { MapLayerId } from './layer.service';
import { MAP_LAYERS } from './map-layers';

/** The Layers tab: a checkbox per map layer, with its color. */
@Component({
  selector: 'app-layers-panel',
  template: `
    <section class="menu-content layer-list" aria-label="Map layers">
      @for (layer of layers; track layer.id) {
        <label class="layer-toggle">
          <input
            type="checkbox"
            [checked]="layerService.visibleLayerIds().has(layer.id)"
            (change)="setVisible(layer.id, $event)"
          >
          <span class="layer-swatch" [class.is-empty]="!layer.color" [style.background-color]="layer.color" aria-hidden="true"></span>
          <span>{{ layer.label }}</span>
        </label>
      }
    </section>
  `,
  styles: `
    :host {
      display: contents;
    }

    // The panel gives this list the space left below the tabs, and only the list scrolls
    .layer-list {
      align-content: start;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      // Room for the checkbox focus outline, which would otherwise be clipped by the scroll container
      margin-inline: -6px;
      padding-inline: 6px;
    }

    .layer-toggle {
      display: flex;
      min-height: 32px;
      align-items: center;
      gap: 12px;
      border-bottom: 1px solid var(--control-border);
      color: var(--control-ink);
      cursor: pointer;

      input {
        width: 18px;
        height: 18px;
        margin: 0;
        accent-color: var(--control-accent);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LayersPanelComponent {
  protected readonly layerService = inject(LayerService);

  protected readonly layers = MAP_LAYERS.map(layer => ({
    id: layer.id,
    label: layer.label,
    color: 'overpass' in layer ? layer.overpass.color : undefined
  }));

  protected setVisible(layerId: MapLayerId, event: Event): void {
    this.layerService.setLayerVisibility(layerId, (event.target as HTMLInputElement).checked);
  }
}
