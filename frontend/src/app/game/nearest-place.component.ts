import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { getDistance } from 'ol/sphere';

import { ClosestLocationsService } from '../distance/closest-locations.service';
import type { LonLat } from '../distance/closest-locations.service';
import { LayerService } from '../layer/layer.service';
import type { MapLayerId } from '../layer/layer.service';
import { GeolocationService } from '../position/geolocation.service';
import { formatDistance } from '../shared/format';
import { GameSessionService } from './game-session.service';
import { QUESTION_CATEGORIES } from './questions';

/** The game's own stations; every other category is a map layer of the same name. */
const GAME_STATIONS = 'game_station';

type Hint =
  | { kind: 'no-origin' }
  | { kind: 'layer-off'; layerId: MapLayerId }
  | { kind: 'none' }
  | { kind: 'found'; name: string; distance: string; from: string };

/**
 * For a hider answering a question about a kind of place: their nearest one, measured from where they are (or
 * their hiding station until the GPS has a position), with a button to answer with it where the question asks
 * for a place.
 */
@Component({
  selector: 'app-nearest-place',
  template: `
    <div class="nearest-place">
      @switch (hint().kind) {
        @case ('no-origin') {
          <p class="status-text">Your nearest {{ names().name }} is found once your position is known.</p>
        }
        @case ('layer-off') {
          <p class="status-text">Show the {{ names().plural }} on the map to find your nearest.</p>
          <div class="panel-actions">
            <button type="button" (click)="showLayer()">Show {{ names().plural }}</button>
          </div>
        }
        @case ('none') {
          <p class="status-text">No {{ names().plural }} loaded near you. Move or zoom out the map to load more.</p>
        }
        @case ('found') {
          @if (found(); as found) {
            <p class="nearest-text">
              Your nearest {{ names().name }}: <strong>{{ found.name }}</strong>,
              <span class="status-text">{{ found.distance }} from {{ found.from }}</span>
            </p>
            @if (canUse()) {
              <div class="panel-actions">
                <button type="button" (click)="use.emit(found.name)">Answer {{ found.name }}</button>
              </div>
            }
          }
        }
      }
    </div>
  `,
  styles: `
    .nearest-place {
      display: grid;
      gap: 6px;
      padding: 8px 10px;
      border-radius: 4px;
      background: #ffffff;
    }

    p {
      margin: 0;
    }

    .nearest-text {
      font-size: 14px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NearestPlaceComponent {
  private readonly session = inject(GameSessionService);
  private readonly geolocation = inject(GeolocationService);
  private readonly closest = inject(ClosestLocationsService);
  private readonly layers = inject(LayerService);

  /** The question's category of place, such as "museums". */
  readonly category = input.required<string>();
  /** Whether the question is answered by naming the place. */
  readonly canUse = input(false);
  /** The name of the place, to answer with. */
  readonly use = output<string>();

  protected readonly names = computed(() =>
    QUESTION_CATEGORIES.find(category => category.id === this.category()) ?? { name: 'place', plural: 'places' });

  /** Where the hider is: the GPS position, or the hiding station until there is one. */
  private readonly origin = computed<{ lonLat: LonLat; from: string } | null>(() => {
    const position = this.geolocation.position();
    if (position) return { lonLat: [position.longitude, position.latitude], from: 'you' };
    const station = this.session.hidingStation()?.station;
    return station ? { lonLat: [station.longitude, station.latitude], from: 'your station' } : null;
  });

  protected readonly hint = computed<Hint>(() => {
    const origin = this.origin();
    if (!origin) return { kind: 'no-origin' };
    const category = this.category();

    if (category === GAME_STATIONS) {
      let nearest: { name: string; meters: number } | null = null;
      for (const station of this.session.stations()) {
        const meters = getDistance([...origin.lonLat], [station.longitude, station.latitude]);
        if (!nearest || meters < nearest.meters) nearest = { name: station.name, meters };
      }
      return nearest
        ? { kind: 'found', name: nearest.name, distance: formatDistance(nearest.meters), from: origin.from }
        : { kind: 'none' };
    }

    const layerId = category as MapLayerId;
    if (!this.layers.getDistanceLayers().has(layerId)) return { kind: 'none' };
    if (!this.layers.visibleLayerIds().has(layerId)) return { kind: 'layer-off', layerId };
    const place = this.closest.nearest(layerId, origin.lonLat);
    return place
      ? { kind: 'found', name: place.name, distance: formatDistance(place.distanceMeters), from: origin.from }
      : { kind: 'none' };
  });

  protected readonly found = computed(() => {
    const hint = this.hint();
    return hint.kind === 'found' ? hint : null;
  });

  protected showLayer(): void {
    const hint = this.hint();
    if (hint.kind === 'layer-off') this.layers.setLayerVisibility(hint.layerId, true);
  }
}
