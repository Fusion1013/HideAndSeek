import { afterRenderEffect, ChangeDetectionStrategy, Component, ElementRef, inject, viewChild } from '@angular/core';

import type { StopDTO } from '../api/generated';
import { ControlsPanelService } from '../controls/controls-panel.service';
import { ReachabilityService } from '../shape/reachability.service';
import { RouteCatalogService } from '../transit/route-catalog.service';
import type { StationTimetableRow } from './station-timetable';
import { StationTimetableService } from './station-timetable.service';

/** The Station tab: the selected stop and its timetable, and the tools that start from it. */
@Component({
  selector: 'app-station-panel',
  templateUrl: './station-panel.component.html',
  styleUrl: './station-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StationPanelComponent {
  protected readonly timetable = inject(StationTimetableService);
  protected readonly controls = inject(ControlsPanelService);
  private readonly reachability = inject(ReachabilityService);
  private readonly catalog = inject(RouteCatalogService);

  private readonly timetableViewport = viewChild<ElementRef<HTMLDivElement>>('timetableViewport');

  constructor() {
    // Scroll the timetable so the next departure is in the middle when it appears. Only the element is
    // tracked, so the clock updating the rows does not pull the list back while someone is scrolling it.
    afterRenderEffect(() => {
      const viewport = this.timetableViewport()?.nativeElement;
      if (!viewport) return;
      const anchor = viewport.querySelector<HTMLElement>('.stop-time-anchor');
      if (!anchor) return;
      // Measured on screen, so it does not depend on which element each offsetTop is relative to
      const anchorTop = anchor.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop;
      viewport.scrollTop = anchorTop + anchor.offsetHeight / 2 - viewport.clientHeight / 2;
    });
  }

  protected clear(): void {
    this.timetable.clear();
    this.controls.select('transit');
  }

  /** The trip's short name, or its route's when the trip has none. */
  protected tripLabel(row: StationTimetableRow): string {
    return row.tripShortName || this.catalog.route(row.routeId)?.routeShortName || row.tripId || 'Unknown';
  }

  /** Makes the station the start of the reachable stations search, and opens that tab. */
  protected findReachable(stop: StopDTO): void {
    this.reachability.setOrigin(stop);
    this.controls.select('reachability');
  }
}
