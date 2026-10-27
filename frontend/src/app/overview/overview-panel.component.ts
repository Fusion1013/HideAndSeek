import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ControlsPanelService } from '../controls/controls-panel.service';
import { DistancesPanelComponent } from '../distance/distances-panel.component';
import { LayersPanelComponent } from '../layer/layers-panel.component';
import { MeasurePanelComponent } from '../shape/measure-panel.component';
import { ReachabilityPanelComponent } from '../shape/reachability-panel.component';
import { StationPanelComponent } from '../station/station-panel.component';
import { TransitPanelComponent } from '../transit/transit-panel.component';
import { VehiclesPanelComponent } from '../vehicle/vehicles-panel.component';

/** Overview mode: browsing the map, its routes, vehicles, stations and layers. */
@Component({
  selector: 'app-overview-panel',
  imports: [
    DistancesPanelComponent, LayersPanelComponent, MeasurePanelComponent, ReachabilityPanelComponent, StationPanelComponent,
    TransitPanelComponent, VehiclesPanelComponent
  ],
  template: `
    @switch (controls.activeMenu()) {
      @case ('transit') {
        <app-transit-panel />
      }
      @case ('vehicles') {
        <app-vehicles-panel />
      }
      @case ('station') {
        <app-station-panel />
      }
      @case ('measure') {
        <app-measure-panel />
      }
      @case ('reachability') {
        <app-reachability-panel />
      }
      @case ('layers') {
        <app-layers-panel />
      }
      @case ('distances') {
        <app-distances-panel />
      }
    }
  `,
  host: { class: 'mode-panel' },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class OverviewPanelComponent {
  protected readonly controls = inject(ControlsPanelService);
}
