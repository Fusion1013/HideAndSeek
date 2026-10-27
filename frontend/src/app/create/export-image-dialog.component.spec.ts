import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LayerService } from '../layer/layer.service';
import { expectNoAxeViolations } from '../../testing/axe';
import { ExportImageDialogComponent, fileName } from './export-image-dialog.component';
import { TemplateImageService } from './template-image.service';

describe('ExportImageDialogComponent', () => {
  let render: ReturnType<typeof vi.fn>;
  let fixture: ComponentFixture<ExportImageDialogComponent>;
  let element: HTMLElement;
  let downloads: { href: string; download: string }[];

  beforeEach(() => {
    // jsdom has no modal dialogs; these do what the browser's do for this test
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true; };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.open = false;
      this.dispatchEvent(new Event('close'));
    };
    URL.createObjectURL = vi.fn(() => 'blob:image');
    URL.revokeObjectURL = vi.fn();
    downloads = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push({ href: this.href, download: this.download });
    });
    render = vi.fn(() => Promise.resolve(new Blob(['png'], { type: 'image/png' })));

    TestBed.configureTestingModule({
      imports: [ExportImageDialogComponent],
      providers: [
        {
          provide: TemplateImageService,
          useValue: { render, imageSize: (_area: unknown, longSide: number) => ({ width: longSide, height: Math.round(longSide * 0.75) }) }
        },
        { provide: LayerService, useValue: { visibleLayerIds: signal(new Set(['base-map', 'parks'])) } }
      ]
    });
    fixture = TestBed.createComponent(ExportImageDialogComponent);
    fixture.componentRef.setInput('templateId', 't1');
    fixture.componentRef.setInput('name', 'Östra Göteborg');
    fixture.componentRef.setInput('area', { west: 11.9, south: 57.6, east: 12.1, north: 57.8 });
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
    document.body.append(element);
  });

  afterEach(() => vi.restoreAllMocks());

  function checkbox(label: string): HTMLInputElement {
    return [...element.querySelectorAll('label')].find(item => item.textContent?.trim() === label)!.querySelector('input')!;
  }

  function open(): void {
    fixture.componentInstance.open();
    fixture.detectChanges();
  }

  async function exportImage(): Promise<void> {
    (element.querySelector('button[type=submit]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('asks what to include, starting from the layers the map shows', async () => {
    open();
    expect(element.querySelector('dialog')?.open).toBe(true);
    expect(checkbox('Base map').checked).toBe(true);
    expect(checkbox('Parks').checked).toBe(true);
    expect(checkbox('Museums').checked).toBe(false);
    expect([...element.querySelectorAll('#export-size option')].map(option => option.textContent?.trim()))
      .toEqual(['2000 × 1500 px', '3000 × 2250 px', '4000 × 3000 px', '6000 × 4500 px']);
    await expectNoAxeViolations(element);
  });

  it('only offers station names with the stations, and a name size with the names', () => {
    open();
    const nameSize = element.querySelector('#export-label-size') as HTMLSelectElement;
    checkbox('Stations').click();
    fixture.detectChanges();
    expect(checkbox('Station names').disabled).toBe(true);
    expect(nameSize.disabled).toBe(true);
    checkbox('Stations').click();
    fixture.detectChanges();
    expect(checkbox('Station names').disabled).toBe(false);
    expect(nameSize.disabled).toBe(false);
    checkbox('Station names').click();
    fixture.detectChanges();
    expect(nameSize.disabled).toBe(true);
  });

  it('makes the image with the chosen options and downloads it', async () => {
    open();
    checkbox('Shade outside the play area').click();
    const nameSize = element.querySelector('#export-label-size') as HTMLSelectElement;
    nameSize.value = 'small';
    nameSize.dispatchEvent(new Event('change'));
    checkbox('Parks').click();
    checkbox('Museums').click();

    await exportImage();

    expect(render).toHaveBeenCalledWith(
      { templateId: 't1', name: 'Östra Göteborg', area: { west: 11.9, south: 57.6, east: 12.1, north: 57.8 } },
      {
        longSide: 3000, outline: true, shadeOutside: false, routes: true, stations: true, stationNames: true,
        labelSize: 'small', title: true, layerIds: ['base-map', 'museums']
      });
    expect(downloads).toEqual([{ href: 'blob:image', download: 'ostra-goteborg.png' }]);
    expect(element.querySelector('dialog')?.open).toBe(false);
  });

  it('downloads nothing once closed, and explains a failure', async () => {
    let finish: (image: Blob) => void = () => undefined;
    render.mockReturnValueOnce(new Promise(resolve => finish = resolve));
    open();
    (element.querySelector('button[type=submit]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(element.querySelector('[role=status]')?.textContent).toContain('Drawing the map');
    [...element.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Cancel')!.click();
    finish(new Blob(['png']));
    await fixture.whenStable();
    expect(downloads).toEqual([]);

    render.mockRejectedValueOnce(new Error('The map took too long to draw'));
    open();
    await exportImage();
    expect(element.querySelector('[role=alert]')?.textContent).toBe('The image could not be made: The map took too long to draw.');
  });

  it('names the file after the template', () => {
    expect(fileName('Centrala Göteborg')).toBe('centrala-goteborg');
    expect(fileName('  Östra / Väst!  ')).toBe('ostra-vast');
    expect(fileName('???')).toBe('play-area');
  });
});
