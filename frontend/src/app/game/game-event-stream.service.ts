import { DOCUMENT, inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { SseMessage, SseParser } from '../shared/sse-parser';

/** The stream could not be opened, or the server answered with an error status. */
export class GameStreamError extends Error {
  constructor(readonly status: number | undefined) {
    super(status === undefined ? 'The event stream could not be opened' : `The event stream answered ${status}`);
  }
}

/** Emitted once the server has accepted the stream, before any event. */
export const STREAM_OPEN: SseMessage = { type: 'open', data: '' };

/**
 * Opens a game's event stream (GET /api/games/{id}/events). Read with fetch, not EventSource, as the request
 * needs the player's token in a header; a token in the address would end up in server and proxy logs.
 */
@Injectable({ providedIn: 'root' })
export class GameEventStream {
  private readonly window = inject(DOCUMENT).defaultView;

  /**
   * Emits {@link STREAM_OPEN}, then each event; completes when the server ends the stream and fails with a
   * {@link GameStreamError} when it cannot be opened. Unsubscribing closes it.
   */
  connect(gameId: string, token: string, lastEventId: string | null): Observable<SseMessage> {
    return new Observable<SseMessage>(subscriber => {
      const abort = new AbortController();
      const headers: Record<string, string> = { Accept: 'text/event-stream', Authorization: `Bearer ${token}` };
      if (lastEventId !== null) headers['Last-Event-ID'] = lastEventId;

      const read = async (): Promise<void> => {
        const fetch = this.window?.fetch.bind(this.window);
        if (!fetch) throw new GameStreamError(undefined);
        const response = await fetch(`/api/games/${encodeURIComponent(gameId)}/events`, {
          headers,
          cache: 'no-store',
          signal: abort.signal
        });
        if (!response.ok || !response.body) throw new GameStreamError(response.status);
        subscriber.next(STREAM_OPEN);

        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        const parser = new SseParser();
        for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
          for (const message of parser.feed(chunk.value)) subscriber.next(message);
        }
        subscriber.complete();
      };

      read().catch((error: unknown) => {
        if (abort.signal.aborted) return;
        subscriber.error(error instanceof GameStreamError ? error : new GameStreamError(undefined));
      });
      return () => abort.abort();
    });
  }
}
