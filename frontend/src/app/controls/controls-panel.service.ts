import { Injectable, signal } from '@angular/core';

export type ControlsMenu = 'transit' | 'vehicles' | 'station' | 'measure' | 'layers' | 'distances';

/** Whether the map controls panel is open and which tab it shows. Any feature can open a tab. */
@Injectable({ providedIn: 'root' })
export class ControlsPanelService {
  readonly open = signal(false);
  readonly activeMenu = signal<ControlsMenu>('transit');

  toggle(): void {
    this.open.update(open => !open);
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
