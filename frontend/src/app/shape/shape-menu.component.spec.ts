import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type OlMap from 'ol/Map';
import { fromLonLat } from 'ol/proj';
import View from 'ol/View';

import { LayerService } from '../layer/layer.service';
import { MapService } from '../map/map.service';
import { expectNoAxeViolations } from '../../testing/axe';
import { MeasurePanelComponent } from './measure-panel.component';
import { ShapeMenuComponent } from './shape-menu.component';
import { ShapeService } from './shape.service';

describe('selecting and adjusting shapes', () => {
  let shapes: ShapeService;

  beforeEach(() => {
    const map = { addLayer: vi.fn(), addInteraction: vi.fn(), getView: () => new View() } as unknown as OlMap;
    TestBed.configureTestingModule({
      providers: [
        { provide: MapService, useValue: { getMap: () => map } },
        { provide: LayerService, useValue: { addMeasureLayer: vi.fn(), visibleLayerIds: signal(new Set()) } }
      ]
    });
    shapes = TestBed.inject(ShapeService);
  });

  function setValue(element: HTMLElement, selector: string, value: string): void {
    const input = element.querySelector(selector) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event(input.type === 'color' ? 'input' : 'change'));
  }

  describe('ShapeMenuComponent', () => {
    let fixture: ComponentFixture<ShapeMenuComponent>;
    let element: HTMLElement;

    function open(): void {
      fixture = TestBed.createComponent(ShapeMenuComponent);
      fixture.detectChanges();
      element = fixture.nativeElement as HTMLElement;
    }

    it('shows nothing until a shape is selected', () => {
      shapes.createCircle(fromLonLat([12, 57]), 2000);
      open();
      expect(element.querySelector('.shape-menu')).toBeNull();
    });

    it('adjusts a selected circle', async () => {
      const circle = shapes.createCircle(fromLonLat([12, 57]), 2000);
      shapes.selectShape(circle);
      open();
      await expectNoAxeViolations(element);
      expect(element.querySelector('#shape-menu-heading')?.textContent).toBe('Circle 1');
      expect(element.querySelector('label[for=shape-size]')?.textContent).toContain('Radius');

      setValue(element, '#shape-size', '500');
      fixture.detectChanges();
      expect(shapes.selectedShape()?.sizeMeters).toBeCloseTo(500, 0);
      expect((element.querySelector('#shape-size') as HTMLInputElement).value).toBe('500');

      setValue(element, '#shape-color', '#102030');
      expect(circle.get('strokeColor')).toBe('#102030');
      setValue(element, '#shape-width', '6');
      expect(circle.get('strokeWidth')).toBe(6);

      const filled = element.querySelector('.shape-check input') as HTMLInputElement;
      expect(filled.checked).toBe(true);
      filled.click();
      expect(circle.get('fillColor')).toBeNull();
    });

    it('puts back a size or width it cannot use', () => {
      shapes.selectShape(shapes.createThermometer(fromLonLat([12, 57]), fromLonLat([12, 57.1])));
      open();
      const size = element.querySelector('#shape-size') as HTMLInputElement;
      const before = size.value;
      setValue(element, '#shape-size', '-5');
      expect(size.value).toBe(before);
      setValue(element, '#shape-width', '40');
      expect((element.querySelector('#shape-width') as HTMLInputElement).value).toBe('3');
      expect(element.querySelector('.shape-check')).toBeNull();
    });

    it('moves a circle by its center', async () => {
      const circle = shapes.createCircle(fromLonLat([12, 57]), 2000);
      shapes.selectShape(circle);
      open();
      await expectNoAxeViolations(element);
      expect([...element.querySelectorAll('.shape-point legend')].map(legend => legend.textContent)).toEqual(['Center']);
      expect((element.querySelector('#shape-point-0-latitude') as HTMLInputElement).value).toBe('57.00000');

      setValue(element, '#shape-point-0-latitude', '58.5');
      setValue(element, '#shape-point-0-longitude', '13.25');
      fixture.detectChanges();
      expect(shapes.selectedShape()?.points[0].latitude).toBeCloseTo(58.5, 6);
      expect(shapes.selectedShape()?.points[0].longitude).toBeCloseTo(13.25, 6);
      expect((element.querySelector('#shape-point-0-longitude') as HTMLInputElement).value).toBe('13.25000');
    });

    it('moves each point of a line on its own', async () => {
      shapes.selectShape(shapes.createLine([fromLonLat([12, 57]), fromLonLat([12, 57.5]), fromLonLat([12, 58])]));
      open();
      await expectNoAxeViolations(element);
      expect([...element.querySelectorAll('.shape-point legend')].map(legend => legend.textContent))
        .toEqual(['Point 1', 'Point 2', 'Point 3']);

      setValue(element, '#shape-point-1-longitude', '12.5');
      fixture.detectChanges();
      expect(shapes.selectedShape()?.points.map(point => point.longitude.toFixed(1))).toEqual(['12.0', '12.5', '12.0']);
    });

    it('moves the two ends of a thermometer on their own, and puts back a position off the map', () => {
      shapes.selectShape(shapes.createThermometer(fromLonLat([12, 57]), fromLonLat([12, 57.1])));
      open();
      expect([...element.querySelectorAll('.shape-point legend')].map(legend => legend.textContent)).toEqual(['Start', 'End']);

      setValue(element, '#shape-point-1-latitude', '57.2');
      fixture.detectChanges();
      expect(shapes.selectedShape()?.points.map(point => point.latitude.toFixed(1))).toEqual(['57.0', '57.2']);

      setValue(element, '#shape-point-0-latitude', '95');
      expect((element.querySelector('#shape-point-0-latitude') as HTMLInputElement).value).toBe('57.00000');
    });

    it('offers no size for a line of several segments', () => {
      shapes.selectShape(shapes.createLine([[0, 0], [10, 10], [20, 0]]));
      open();
      expect(element.querySelector('#shape-size')).toBeNull();
    });

    it('closes, deselecting the shape, and deletes it', () => {
      const line = shapes.createLine([[0, 0], [10, 10]]);
      shapes.selectShape(line);
      open();

      (element.querySelector('.shape-menu') as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      fixture.detectChanges();
      expect(shapes.selectedShape()).toBeNull();
      expect(element.querySelector('.shape-menu')).toBeNull();

      shapes.selectShape(line);
      fixture.detectChanges();
      (element.querySelector('.shape-delete') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(shapes.getShapes()).toHaveLength(0);
      expect(element.querySelector('.shape-menu')).toBeNull();
    });
  });

  describe('the list in the Measure tab', () => {
    it('selects a shape, and deselects it when picked again', async () => {
      const first = shapes.createLine([[0, 0], [10, 10]]);
      shapes.createCircle([5, 5], 2);
      const fixture = TestBed.createComponent(MeasurePanelComponent);
      fixture.componentRef.setInput('stationDistances', false);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      const rows = () => [...element.querySelectorAll<HTMLButtonElement>('.shape-list button')];

      expect(rows().map(row => row.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['Line 1 14 m', 'Circle 1 R 2 m']);
      await expectNoAxeViolations(element);

      rows()[0].click();
      fixture.detectChanges();
      expect(shapes.selectedShape()?.feature).toBe(first);
      expect(rows().map(row => row.getAttribute('aria-pressed'))).toEqual(['true', 'false']);

      rows()[0].click();
      fixture.detectChanges();
      expect(shapes.selectedShape()).toBeNull();
    });
  });
});
