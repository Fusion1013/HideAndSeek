import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import {
  LucideBusFront, LucideLayers, LucideLocateFixed, LucideMapPin, LucidePanelRightClose, LucidePanelRightOpen, LucideRoute,
  LucideRuler
} from '@lucide/angular';

import { ControlsPanelService } from './controls-panel.service';

/** The slide-in panel beside the map: its toggle, the tab buttons, and the active tab (projected content). */
@Component({
  selector: 'app-controls-panel',
  templateUrl: './controls-panel.component.html',
  styleUrl: './controls-panel.component.scss',
  imports: [LucideBusFront, LucideLayers, LucideLocateFixed, LucideMapPin, LucidePanelRightClose, LucidePanelRightOpen, LucideRoute, LucideRuler],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ControlsPanelComponent {
  /** The station tab is only offered while a station is selected. */
  readonly stationAvailable = input(false);

  protected readonly controls = inject(ControlsPanelService);
}
