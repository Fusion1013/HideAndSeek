import { computed, Injectable, signal } from '@angular/core';

import type { Position } from '../api/generated';

export type PathPoint = 'start' | 'end';

/**
 * The two points of a thermometer question being put together. Kept apart from the questions tab, as seekers set the
 * start and move on to other tabs before they ask, and the next click on the map may be the point.
 */
@Injectable()
export class ThermometerDraftService {
  readonly start = signal<Position | null>(null);
  readonly end = signal<Position | null>(null);
  /** The point the next click on the map sets. */
  readonly picking = signal<PathPoint | null>(null);
  readonly complete = computed(() => !!this.start() && !!this.end());
  /** Whether the seekers have thermometer chosen as the question to ask, which outlasts the questions tab. */
  readonly selected = signal(false);
  /** The points to show on the map: kept while another kind of question is chosen, but not shown. */
  readonly shown = computed(() => this.selected() ? { start: this.start(), end: this.end() } : { start: null, end: null });

  point(which: PathPoint): Position | null {
    return which === 'start' ? this.start() : this.end();
  }

  set(which: PathPoint, position: Position): void {
    (which === 'start' ? this.start : this.end).set(position);
    this.picking.set(null);
  }

  clear(): void {
    this.start.set(null);
    this.end.set(null);
    this.picking.set(null);
  }
}
