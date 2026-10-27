import { ChangeDetectionStrategy, Component, DOCUMENT, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';

import { LayerService } from '../layer/layer.service';
import { MAP_LAYERS } from '../layer/map-layers';
import type { MapLayerId } from '../layer/map-layers';
import type { AreaBounds } from './area-bounds';
import { LabelSize, TemplateImageService } from './template-image.service';

/**
 * Image sizes offered, by the longer side in pixels. Larger images show more map at the same size of markers and
 * names, so crowded stations get more room.
 */
export const IMAGE_SIZES = [2000, 3000, 4000, 6000] as const;

const LABEL_SIZES: readonly { size: LabelSize; label: string }[] = [
  { size: 'small', label: 'Small' },
  { size: 'medium', label: 'Medium' },
  { size: 'large', label: 'Large' }
];

/** Map layers that can go into the image; routes, stops and vehicles are covered by the options above them. */
const EXPORTABLE_LAYERS = MAP_LAYERS.filter(layer => !['routes', 'stops', 'vehicles'].includes(layer.id));

/**
 * Asks what to include in an image of the template's play area, then makes it and downloads it as a PNG.
 * Opened from the template editor.
 */
@Component({
  selector: 'app-export-image-dialog',
  imports: [ReactiveFormsModule],
  template: `
    <dialog #dialog class="export-dialog" aria-labelledby="export-heading" (close)="cancelled = true">
      <form [formGroup]="form" (ngSubmit)="export()">
        <h2 id="export-heading">Export as PNG</h2>
        <p class="status-text">An image of {{ name() }}'s play area, for printing or sharing.</p>

        <fieldset>
          <legend>Include</legend>
          <label class="check-field"><input type="checkbox" formControlName="outline"> Play area outline</label>
          <label class="check-field"><input type="checkbox" formControlName="shadeOutside"> Shade outside the play area</label>
          <label class="check-field"><input type="checkbox" formControlName="routes"> Chosen routes</label>
          <label class="check-field"><input type="checkbox" formControlName="stations"> Stations</label>
          <label class="check-field nested"><input type="checkbox" formControlName="stationNames"> Station names</label>
          <label class="control-field nested" for="export-label-size">
            Name size
            <select id="export-label-size" formControlName="labelSize">
              @for (option of labelSizes; track option.size) {
                <option [value]="option.size">{{ option.label }}</option>
              }
            </select>
          </label>
          <label class="check-field"><input type="checkbox" formControlName="title"> Template name as a title</label>
        </fieldset>

        <fieldset formGroupName="layers">
          <legend>Map layers</legend>
          <div class="layer-options">
            @for (layer of layers; track layer.id) {
              <label class="check-field"><input type="checkbox" [formControlName]="layer.id"> {{ layer.label }}</label>
            }
          </div>
        </fieldset>

        <label class="control-field" for="export-size">
          Size <span class="hint">(larger images give crowded stations more room)</span>
          <select id="export-size" formControlName="longSide">
            @for (size of sizes; track size) {
              <option [ngValue]="size">{{ sizeLabel(size) }}</option>
            }
          </select>
        </label>

        @if (error()) {
          <p class="load-error" role="alert">{{ error() }}</p>
        }
        <p class="status-text" role="status">{{ busy() ? 'Drawing the map… large images take a few seconds.' : '' }}</p>

        <div class="panel-actions">
          <button type="submit" class="primary-action" [disabled]="busy()">{{ busy() ? 'Exporting…' : 'Export' }}</button>
          <button type="button" (click)="close()">{{ busy() ? 'Cancel' : 'Close' }}</button>
        </div>
      </form>
    </dialog>
  `,
  styleUrl: './export-image-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExportImageDialogComponent {
  private readonly images = inject(TemplateImageService);
  private readonly layerService = inject(LayerService);
  private readonly document = inject(DOCUMENT);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  readonly templateId = input.required<string>();
  readonly name = input.required<string>();
  readonly area = input.required<AreaBounds>();

  protected readonly layers = EXPORTABLE_LAYERS;
  protected readonly sizes = IMAGE_SIZES;
  protected readonly labelSizes = LABEL_SIZES;
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  /** Set when the dialog closes, so an image still being drawn is not downloaded after all. */
  protected cancelled = false;

  protected readonly form = new FormGroup({
    outline: new FormControl(true, { nonNullable: true }),
    shadeOutside: new FormControl(true, { nonNullable: true }),
    routes: new FormControl(true, { nonNullable: true }),
    stations: new FormControl(true, { nonNullable: true }),
    stationNames: new FormControl(true, { nonNullable: true }),
    labelSize: new FormControl<LabelSize>('medium', { nonNullable: true }),
    title: new FormControl(true, { nonNullable: true }),
    layers: new FormGroup(Object.fromEntries(EXPORTABLE_LAYERS.map(layer =>
      [layer.id, new FormControl(false, { nonNullable: true })]))),
    longSide: new FormControl<number>(3000, { nonNullable: true })
  });

  constructor() {
    // Names need stations to label, and a size only matters for names
    const controls = this.form.controls;
    const syncNames = () => {
      if (controls.stations.value) controls.stationNames.enable({ emitEvent: false });
      else controls.stationNames.disable({ emitEvent: false });
      if (controls.stations.value && controls.stationNames.value) controls.labelSize.enable({ emitEvent: false });
      else controls.labelSize.disable({ emitEvent: false });
    };
    controls.stations.valueChanges.pipe(takeUntilDestroyed()).subscribe(syncNames);
    controls.stationNames.valueChanges.pipe(takeUntilDestroyed()).subscribe(syncNames);
  }

  /** Opens the dialog, starting from the layers the map shows now. */
  open(): void {
    const visible = this.layerService.visibleLayerIds();
    this.form.controls.layers.setValue(Object.fromEntries(EXPORTABLE_LAYERS.map(layer => [layer.id, visible.has(layer.id)])));
    this.error.set('');
    this.dialog().nativeElement.showModal();
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }

  protected sizeLabel(longSide: number): string {
    const { width, height } = this.images.imageSize(this.area(), longSide);
    return `${width} × ${height} px`;
  }

  protected async export(): Promise<void> {
    const value = this.form.getRawValue();
    this.busy.set(true);
    this.error.set('');
    this.cancelled = false;
    try {
      const image = await this.images.render(
        { templateId: this.templateId(), name: this.name(), area: this.area() },
        {
          longSide: value.longSide,
          outline: value.outline,
          shadeOutside: value.shadeOutside,
          routes: value.routes,
          stations: value.stations,
          stationNames: value.stations && value.stationNames,
          labelSize: value.labelSize,
          title: value.title,
          layerIds: Object.entries(value.layers).filter(([, chosen]) => chosen).map(([id]) => id as MapLayerId)
        });
      if (this.cancelled) return;
      this.download(image);
      this.close();
    } catch (error: unknown) {
      this.error.set(error instanceof Error && error.message
        ? `The image could not be made: ${error.message}.`
        : 'The image could not be made.');
    } finally {
      this.busy.set(false);
    }
  }

  private download(image: Blob): void {
    const url = URL.createObjectURL(image);
    const link = this.document.createElement('a');
    link.href = url;
    link.download = `${fileName(this.name())}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** The template's name as a file name: "Östra Göteborg" is "ostra-goteborg". */
export function fileName(name: string): string {
  const slug = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'play-area';
}
