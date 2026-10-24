import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { MapComponent } from './map/map.component';

@Component({
  selector: 'app-root',
  imports: [MapComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class App {

  protected readonly title = signal('jetlag-web');

}
