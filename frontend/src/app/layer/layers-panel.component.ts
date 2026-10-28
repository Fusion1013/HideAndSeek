import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { LucideHexagon } from '@lucide/angular';

import { BaseMapLayerService } from './base-map-layer.service';
import { BASE_MAPS } from './base-maps';
import type { BaseMapId } from './base-maps';
import { LayerService } from './layer.service';
import type { MapLayerId } from './layer.service';
import { MAP_LAYERS } from './map-layers';
import type { MapLayerDefinition } from './map-layers';

/** Choosing "None" hides the base map layer rather than picking a map. */
type BaseMapChoice = BaseMapId | 'none';

/**
 * The Layers tab: a choice of base map, then a checkbox per map layer, with its color, and for layers of places
 * a Regions toggle for the areas where each place is the closest one.
 */
@Component({
  selector: 'app-layers-panel',
  imports: [LucideHexagon],
  template: `
    <section class="menu-content layer-list" aria-label="Map layers">
      <fieldset class="base-maps">
        <legend>Base map</legend>
        @for (baseMap of baseMaps; track baseMap.id) {
          <label class="layer-toggle">
            <input
              type="radio"
              name="base-map"
              [value]="baseMap.id"
              [checked]="baseMapChoice() === baseMap.id"
              (change)="chooseBaseMap(baseMap.id)"
            >
            <span>{{ baseMap.label }}</span>
          </label>
        }
      </fieldset>
      @for (layer of layers; track layer.id) {
        <div class="layer-row">
          <label class="layer-toggle">
            <input
              type="checkbox"
              [checked]="layerService.visibleLayerIds().has(layer.id)"
              (change)="setVisible(layer.id, $event)"
            >
            <span class="layer-swatch" [class.is-empty]="!layer.color" [style.background-color]="layer.color" aria-hidden="true"></span>
            <span>{{ layer.label }}</span>
          </label>
          @if (layer.regions; as regions) {
            <button
              type="button"
              class="regions-toggle"
              [attr.aria-label]="regions.label"
              [attr.aria-pressed]="layerService.visibleLayerIds().has(regions.id)"
              (click)="toggle(regions.id)"
            >
              <svg lucideHexagon [size]="14" aria-hidden="true"></svg>
              Regions
            </button>
          }
        </div>
      }
    </section>
  `,
  styles: `
    :host {
      display: contents;
    }

    // The panel gives this list the space left below the tabs, and only the list scrolls
    .layer-list {
      flex: 1 1 0;
      align-content: start;
      gap: 2px;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      // Room for the checkbox focus outline, which would otherwise be clipped by the scroll container
      margin-inline: -6px;
      padding-inline: 6px;
    }

    .base-maps {
      display: grid;
      gap: 2px;
      margin: 0 0 10px;
      padding: 0;
      border: 0;

      legend {
        min-height: 28px;
        padding: 0;
        color: var(--control-ink);
        font-size: 14px;
        font-weight: 650;
      }
    }

    .layer-row {
      display: flex;
      align-items: center;
      gap: 8px;
      border-bottom: 1px solid var(--control-border);

      .layer-toggle {
        flex: 1;
        min-width: 0;
        border-bottom: 0;
      }
    }

    // Shows the areas where each of the layer's places is the closest one
    .regions-toggle {
      display: inline-flex;
      flex: none;
      align-items: center;
      gap: 4px;
      min-height: 26px;
      padding: 2px 8px;
      border: 1px solid var(--control-field-border);
      border-radius: 5px;
      background: #ffffff;
      color: var(--control-ink);
      font: inherit;
      font-size: 12px;
      cursor: pointer;

      &:hover {
        background: var(--control-hover);
      }

      &[aria-pressed='true'] {
        border-color: var(--control-accent);
        background: var(--control-selected);
        color: var(--control-accent-strong);
      }
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
  private readonly baseMapService = inject(BaseMapLayerService);

  protected readonly baseMaps: readonly { id: BaseMapChoice; label: string }[] = [
    ...BASE_MAPS.map(baseMap => ({ id: baseMap.id, label: baseMap.label })),
    { id: 'none', label: 'None' }
  ];

  protected readonly baseMapChoice = computed<BaseMapChoice>(() =>
    this.layerService.visibleLayerIds().has('base-map') ? this.baseMapService.baseMapId() : 'none');

  // The base map is chosen above, and region layers are toggled on the line of the layer they belong to
  protected readonly layers = (MAP_LAYERS as readonly MapLayerDefinition[])
    .filter(layer => layer.id !== 'base-map' && !layer.regionsOf)
    .map(layer => {
      const regions = MAP_LAYERS.find(other => 'regionsOf' in other && other.regionsOf === layer.id);
      return {
        id: layer.id as MapLayerId,
        label: layer.label,
        color: layer.overpass?.color,
        regions: regions && { id: regions.id, label: regions.label }
      };
    });

  protected chooseBaseMap(choice: BaseMapChoice): void {
    if (choice !== 'none') this.baseMapService.setBaseMap(choice);
    this.layerService.setLayerVisibility('base-map', choice !== 'none');
  }

  protected toggle(layerId: MapLayerId): void {
    this.layerService.setLayerVisibility(layerId, !this.layerService.getLayerVisibility(layerId));
  }

  protected setVisible(layerId: MapLayerId, event: Event): void {
    this.layerService.setLayerVisibility(layerId, (event.target as HTMLInputElement).checked);
  }
}
