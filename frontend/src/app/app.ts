import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { MapComponent } from './map/map.component';
import { HelloService } from './api/generated/api/hello.service';

@Component({
  selector: 'app-root',
  imports: [MapComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class App implements OnInit {
  private readonly helloService = inject(HelloService);

  protected readonly title = signal('jetlag-web');
  readonly greeting = signal('Connecting to backend...');

  ngOnInit(): void {
    this.helloService.getHello().subscribe({
      next: greeting => this.greeting.set(greeting),
      error: () => this.greeting.set('Backend unavailable')
    });
  }
}
