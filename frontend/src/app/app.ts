import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MapComponent } from './map/map.component';
import { AppMode, ModeService } from './mode/mode.service';

const MODE_TITLES: Record<AppMode, string> = { overview: 'Overview', create: 'Create a game', game: 'Play' };

@Component({
  selector: 'app-root',
  imports: [MapComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class App {

  protected readonly title = signal('jetlag-web');

  private readonly mode = inject(ModeService).mode;
  protected readonly modeTitle = computed(() => MODE_TITLES[this.mode()]);

}
