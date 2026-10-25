import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of } from 'rxjs';

import { GameControllerService } from '../api/generated';
import type { GameDTO } from '../api/generated';
import { AccessTokenStore } from '../auth/access-token.store';
import { httpStatus } from '../shared/problem-detail';

const STATUS_LABELS: Record<GameDTO.StatusEnum, string> = {
  LOBBY: 'In the lobby',
  HIDING: 'Hiding',
  SEEKING: 'Seeking',
  FINISHED: 'Over'
};

/** The games this browser has joined and that are still running, to go back to. */
@Component({
  selector: 'app-my-games',
  imports: [RouterLink],
  template: `
    @if (running().length > 0) {
      <nav class="game-section" aria-labelledby="my-games-heading">
        <h3 id="my-games-heading" class="panel-heading">Your games</h3>
        <ul class="game-links">
          @for (game of running(); track game.id) {
            <li>
              <a [routerLink]="['/game', game.id]">{{ game.name }}</a>
              <span>{{ statusLabels[game.status] }}</span>
            </li>
          }
        </ul>
      </nav>
    }
  `,
  styleUrl: './game-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MyGamesComponent {
  private readonly gameApi = inject(GameControllerService);
  private readonly tokens = inject(AccessTokenStore);

  protected readonly statusLabels = STATUS_LABELS;

  /** Each game is read with its own token; one that refuses it or no longer exists is forgotten. */
  private readonly games = rxResource({
    stream: () => {
      const ids = this.tokens.ids('games');
      if (ids.length === 0) return of<GameDTO[]>([]);
      return forkJoin(ids.map(id => this.gameApi.getGame(id).pipe(
        map(view => view.game),
        catchError((error: unknown) => {
          const status = httpStatus(error);
          if (status === 401 || status === 403 || status === 404) this.tokens.remove('games', id);
          return of<GameDTO | null>(null);
        })
      ))).pipe(map(games => games.filter((game): game is GameDTO => game !== null)));
    }
  });

  protected readonly running = computed(() =>
    (this.games.hasValue() ? this.games.value() : []).filter(game => game.status !== 'FINISHED'));
}
