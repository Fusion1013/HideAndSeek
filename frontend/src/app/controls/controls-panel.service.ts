import { computed, inject, Injectable, linkedSignal, signal } from '@angular/core';

import { AppMode, ModeService } from '../mode/mode.service';

export type ControlsMenu =
  'transit' | 'vehicles' | 'station' | 'measure' | 'layers' | 'distances' | 'template' | 'game' | 'questions' | 'hiding';

/** The tabs each mode offers, in the order they are shown. The first is the one a mode opens on. */
const MODE_TABS: Readonly<Record<AppMode, readonly ControlsMenu[]>> = {
  overview: ['transit', 'vehicles', 'station', 'measure', 'layers', 'distances'],
  create: ['template', 'layers'],
  game: ['game', 'questions', 'hiding', 'layers']
};

/** Whether the map controls panel is open and which tab it shows. Any feature can open a tab. */
@Injectable({ providedIn: 'root' })
export class ControlsPanelService {
  private readonly modeService = inject(ModeService);

  readonly open = signal(false);

  /** Tabs of the current mode that do not apply now; the game page offers its questions and hiding tabs as they do. */
  private readonly unavailable = signal<ReadonlySet<ControlsMenu>>(new Set<ControlsMenu>(['questions', 'hiding']));

  /** The tabs of the current mode. */
  readonly tabs = computed(() => MODE_TABS[this.modeService.mode()].filter(tab => !this.unavailable().has(tab)));

  /** Stays on the same tab across a mode change when the new mode has it too, else that mode's first tab. */
  readonly activeMenu = linkedSignal<readonly ControlsMenu[], ControlsMenu>({
    source: this.tabs,
    computation: (tabs, previous) => previous && tabs.includes(previous.value) ? previous.value : tabs[0]
  });

  toggle(): void {
    this.open.update(open => !open);
  }

  hasTab(menu: ControlsMenu): boolean {
    return this.tabs().includes(menu);
  }

  /** Offers a tab of the current mode, or takes it away; the panel moves to another tab if it was open. */
  setAvailable(menu: ControlsMenu, available: boolean): void {
    this.unavailable.update(menus => {
      if (menus.has(menu) !== available) return menus;
      const next = new Set(menus);
      if (available) next.delete(menu); else next.add(menu);
      return next;
    });
  }

  /** Switches tab without opening or closing the panel. */
  select(menu: ControlsMenu): void {
    this.activeMenu.set(menu);
  }

  /** Opens the panel on a tab, e.g. after something on the map was clicked. */
  show(menu: ControlsMenu): void {
    this.activeMenu.set(menu);
    this.open.set(true);
  }
}
