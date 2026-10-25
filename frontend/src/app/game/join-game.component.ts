import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { GameControllerService } from '../api/generated';
import { AccessTokenStore } from '../auth/access-token.store';
import { problemDetail } from '../shared/problem-detail';

export const MAX_PLAYER_NAME_LENGTH = 30;

/** Joining a game with the code its host shares. */
@Component({
  selector: 'app-join-game',
  imports: [ReactiveFormsModule],
  template: `
    <form class="game-section" [formGroup]="form" (ngSubmit)="join()" aria-labelledby="join-heading">
      <h3 id="join-heading" class="panel-heading">Join a game</h3>
      <div class="control-field">
        <label for="join-code">Invite code</label>
        <input id="join-code" type="text" formControlName="inviteCode" autocomplete="off" autocapitalize="characters"
          spellcheck="false" maxlength="12" [attr.aria-invalid]="invalid('inviteCode')">
      </div>
      <div class="control-field">
        <label for="join-name">Your name</label>
        <input id="join-name" type="text" formControlName="displayName" autocomplete="nickname"
          [maxLength]="maxNameLength" [attr.aria-invalid]="invalid('displayName')">
      </div>
      @if (error()) {
        <p class="load-error" role="alert">{{ error() }}</p>
      }
      <div class="panel-actions">
        <button type="submit" class="primary-action" [disabled]="busy()">{{ busy() ? 'Joining…' : 'Join' }}</button>
      </div>
    </form>
  `,
  styleUrl: './game-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class JoinGameComponent {
  private readonly gameApi = inject(GameControllerService);
  private readonly tokens = inject(AccessTokenStore);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** From an invite link: /join?code=... */
  readonly code = input<string>();

  protected readonly maxNameLength = MAX_PLAYER_NAME_LENGTH;
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly form = new FormGroup({
    inviteCode: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    displayName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/), Validators.maxLength(MAX_PLAYER_NAME_LENGTH)]
    })
  });

  constructor() {
    effect(() => {
      const code = this.code();
      if (code) untracked(() => this.form.controls.inviteCode.setValue(code));
    });
  }

  protected invalid(control: 'inviteCode' | 'displayName'): boolean {
    const field = this.form.controls[control];
    return field.touched && field.invalid;
  }

  protected join(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.error.set(this.form.controls.inviteCode.invalid ? 'Enter the invite code.' : 'Enter your name.');
      return;
    }
    const { inviteCode, displayName } = this.form.getRawValue();
    this.busy.set(true);
    this.error.set('');
    this.gameApi.joinGame({ inviteCode, displayName: displayName.trim() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ gameId, playerToken }) => {
          this.tokens.set('games', gameId, playerToken);
          void this.router.navigate(['/game', gameId]);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.error.set(problemDetail(error) ?? 'Could not join. Check the connection and try again.');
        }
      });
  }
}
