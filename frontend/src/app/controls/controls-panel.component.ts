import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LucideBusFront, LucideEyeOff, LucideLayers, LucideLocateFixed, LucideMapPin, LucideMessageCircleQuestionMark, LucidePanelRightClose, LucidePanelRightOpen, LucideRoute,
  LucideRuler, LucideSquareDashed, LucideUsers
} from '@lucide/angular';

import { MODE_TITLES, ModeService } from '../mode/mode.service';
import { ControlsPanelService } from './controls-panel.service';

/**
 * The slide-in panel beside the map: its toggle, the mode links, the current mode's tab buttons, and the active
 * tab (projected content).
 */
@Component({
  selector: 'app-controls-panel',
  templateUrl: './controls-panel.component.html',
  styleUrl: './controls-panel.component.scss',
  imports: [
    RouterLink, LucideBusFront, LucideEyeOff, LucideLayers, LucideLocateFixed, LucideMapPin, LucideMessageCircleQuestionMark, LucidePanelRightClose, LucidePanelRightOpen,
    LucideRoute, LucideRuler, LucideSquareDashed, LucideUsers
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ControlsPanelComponent {
  /** The station tab is only offered while a station is selected. */
  readonly stationAvailable = input(false);

  protected readonly controls = inject(ControlsPanelService);
  private readonly modes = inject(ModeService);
  protected readonly mode = this.modes.mode;
  /** Each mode link returns to where that mode was left, such as the game being played. */
  protected readonly urls = this.modes.modeUrls;
  protected readonly title = computed(() => MODE_TITLES[this.mode()]);
}
