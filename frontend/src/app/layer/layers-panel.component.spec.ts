import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { expectNoAxeViolations } from '../../testing/axe';
import { BaseMapLayerService } from './base-map-layer.service';
import { LayerService } from './layer.service';
import type { MapLayerId } from './layer.service';
import { LayersPanelComponent } from './layers-panel.component';

describe('LayersPanelComponent', () => {
  let fixture: ComponentFixture<LayersPanelComponent>;
  let element: HTMLElement;
  const visible = signal<ReadonlySet<MapLayerId>>(new Set(['base-map']));
  const setLayerVisibility = vi.fn((id: MapLayerId, on: boolean) => visible.update(ids => {
    const next = new Set(ids);
    if (on) next.add(id); else next.delete(id);
    return next;
  }));

  beforeEach(() => {
    visible.set(new Set(['base-map']));
    setLayerVisibility.mockClear();
    TestBed.configureTestingModule({
      imports: [LayersPanelComponent],
      providers: [
        {
          provide: LayerService,
          useValue: {
            visibleLayerIds: visible,
            setLayerVisibility,
            getLayerVisibility: (id: MapLayerId) => visible().has(id)
          }
        },
        { provide: BaseMapLayerService, useValue: { baseMapId: signal('streets'), setBaseMap: vi.fn() } }
      ]
    });
    fixture = TestBed.createComponent(LayersPanelComponent);
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  });

  function row(label: string): HTMLElement {
    return [...element.querySelectorAll<HTMLElement>('.layer-row')].find(r => r.textContent?.includes(label))!;
  }

  it('toggles a layer\'s regions from its own line, not a line of their own', async () => {
    expect(element.textContent).not.toContain('Airport Regions');
    const regions = row('Airports').querySelector('button')!;
    expect(regions.getAttribute('aria-label')).toBe('Airport Regions');
    expect(regions.getAttribute('aria-pressed')).toBe('false');

    regions.click();
    fixture.detectChanges();
    expect(setLayerVisibility).toHaveBeenCalledWith('airport_regions', true);
    expect(regions.getAttribute('aria-pressed')).toBe('true');
    // The places themselves stay as they were
    expect(visible().has('airports')).toBe(false);

    await expectNoAxeViolations(element);
  });

  it('offers no regions for layers without them', () => {
    expect(row('Coastline').querySelector('button')).toBeNull();
  });
});
