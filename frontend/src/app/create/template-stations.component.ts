import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import {
  DEFAULT_STATION_GAP_MINUTES, MAX_STATION_GAP_MINUTES, MIN_STATION_GAP_MINUTES, TemplateEditorService
} from './template-editor.service';

/** Whether a template's games leave out stations that are seldom served, and how seldom. Off unless turned on. */
@Component({
  selector: 'app-template-stations',
  template: `
    <fieldset class="panel-section" [disabled]="!editor.canEdit() || editor.busy()">
      <legend class="panel-heading">Stations</legend>
      <label class="check-field">
        <input type="checkbox" [checked]="editor.maxStationGapMinutes() !== undefined" (change)="setFiltered($event)">
        Only frequently served stations
      </label>
      @if (editor.maxStationGapMinutes(); as minutes) {
        <label class="control-field rule-minutes" for="station-gap">
          Arrival or departure at least every (minutes)
          <input id="station-gap" type="number" step="1" [min]="minMinutes" [max]="maxMinutes" [value]="minutes"
            aria-describedby="station-gap-hint" (change)="setMinutes($event)">
        </label>
        <p id="station-gap-hint" class="status-text">
          Checked from 08:00 to 20:00 on the day a game is created, counting only this template's routes.
        </p>
      }
    </fieldset>
  `,
  styleUrl: './create-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TemplateStationsComponent {
  protected readonly editor = inject(TemplateEditorService);

  protected readonly minMinutes = MIN_STATION_GAP_MINUTES;
  protected readonly maxMinutes = MAX_STATION_GAP_MINUTES;

  protected setFiltered(event: Event): void {
    const filtered = (event.target as HTMLInputElement).checked;
    this.editor.setMaxStationGapMinutes(filtered ? DEFAULT_STATION_GAP_MINUTES : undefined);
  }

  /** Whatever is typed becomes a time that can be saved; nothing at all, the default. */
  protected setMinutes(event: Event): void {
    const input = event.target as HTMLInputElement;
    const typed = Number.isNaN(input.valueAsNumber) ? DEFAULT_STATION_GAP_MINUTES : Math.round(input.valueAsNumber);
    const minutes = Math.min(Math.max(typed, MIN_STATION_GAP_MINUTES), MAX_STATION_GAP_MINUTES);
    input.value = String(minutes);
    this.editor.setMaxStationGapMinutes(minutes);
  }
}
