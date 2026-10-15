import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { App } from './app';
import { HelloService } from './api/generated/api/hello.service';

describe('App', () => {
  beforeEach(async () => {
    vi.stubGlobal('ResizeObserver', class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    });

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        { provide: HelloService, useValue: { getHello: () => of('Hello, world!') } }
      ]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render transit line controls', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    (compiled.querySelector('#map-controls-toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(compiled.querySelector('#line-select')).toBeTruthy();
  });

  it('should show the backend greeting', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="status"]')?.textContent)
      .toContain('Hello, world!');
  });
});
