import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { GameControllerService } from '../api/generated';
import { AccessTokenStore } from '../auth/access-token.store';
import { MAX_PLAYER_NAME_LENGTH } from '../game/join-game.component';
import { problemDetail } from '../shared/problem-detail';

const MIN_HIDING_MINUTES = 1;
const MAX_HIDING_MINUTES = 300;

/** Starts a game from a saved template, with this player as its host. */
@Component({
  selector: 'app-host-game',
  imports: [ReactiveFormsModule],
  template: `
    <form class="panel-section" [formGroup]="form" (ngSubmit)="host()" aria-labelledby="host-heading">
      <h3 id="host-heading" class="panel-heading">Play this template</h3>
      <p class="status-text">Creates a game with an invite code for the others to join. You will be its host.</p>
      <div class="host-fields">
        <div class="control-field">
          <label for="host-name">Your name</label>
          <input id="host-name" type="text" formControlName="displayName" autocomplete="nickname"
            [maxLength]="maxNameLength" [attr.aria-invalid]="form.controls.displayName.touched && form.controls.displayName.invalid">
        </div>
        <div class="control-field">
          <label for="host-hiding">Hiding time (minutes)</label>
          <input id="host-hiding" type="number" inputmode="numeric" formControlName="hidingMinutes"
            [min]="minHiding" [max]="maxHiding" [attr.aria-invalid]="form.controls.hidingMinutes.touched && form.controls.hidingMinutes.invalid">
        </div>
      </div>
      @if (error()) {
        <p class="load-error" role="alert">{{ error() }}</p>
      }
      <div class="panel-actions">
        <button type="submit" class="primary-action" [disabled]="busy() || disabled()">
          {{ busy() ? 'Creating the game…' : 'Create a game' }}
        </button>
      </div>
    </form>
  `,
  styleUrl: './create-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HostGameComponent {
  private readonly gameApi = inject(GameControllerService);
  private readonly tokens = inject(AccessTokenStore);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly templateId = input.required<string>();
  /** While the template has unsaved changes, which the game would not get. */
  readonly disabled = input(false);

  protected readonly maxNameLength = MAX_PLAYER_NAME_LENGTH;
  protected readonly minHiding = MIN_HIDING_MINUTES;
  protected readonly maxHiding = MAX_HIDING_MINUTES;
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly form = new FormGroup({
    displayName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/), Validators.maxLength(MAX_PLAYER_NAME_LENGTH)]
    }),
    hidingMinutes: new FormControl(30, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(MIN_HIDING_MINUTES), Validators.max(MAX_HIDING_MINUTES)]
    })
  });

  protected host(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.error.set(this.form.controls.displayName.invalid
        ? 'Enter your name.'
        : `The hiding time must be ${MIN_HIDING_MINUTES} to ${MAX_HIDING_MINUTES} minutes.`);
      return;
    }
    const { displayName, hidingMinutes } = this.form.getRawValue();
    this.busy.set(true);
    this.error.set('');
    this.gameApi.createGame({ templateId: this.templateId(), displayName: displayName.trim(), hidingMinutes })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ gameId, playerToken }) => {
          this.tokens.set('games', gameId, playerToken);
          void this.router.navigate(['/game', gameId]);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.error.set(problemDetail(error) ?? 'The game could not be created. Check the connection and try again.');
        }
      });
  }
}
