import { START, TIMELINE } from '../../../testing/game-timeline';
import { frameAt, lastAtOrBefore, MAX_INTERPOLATION_GAP_MS, readReplay } from './replay';

describe('replay', () => {
  const replay = readReplay(TIMELINE);

  it('runs from the start of the hiding time to the end of the game', () => {
    expect(replay.start).toBe(START);
    expect(replay.end).toBe(START + 60 * 60_000);
  });

  it('moves players along their paths between reports, but not across long gaps', () => {
    const halfway = frameAt(replay, START + 90_000);
    const ada = halfway.players.find(player => player.player.id === 'p1')!;
    expect(ada.position![0]).toBeCloseTo(11.95);
    expect(ada.path).toHaveLength(2);

    const waiting = frameAt(replay, START + 10 * 60_000).players.find(player => player.player.id === 'p1')!;
    expect(20 * 60_000 - 2 * 60_000).toBeGreaterThan(MAX_INTERPOLATION_GAP_MS);
    expect(waiting.position).toEqual([12.0, 57.7]);
    expect(waiting.path).toHaveLength(2);
  });

  it('has no position for a player before their first report', () => {
    const grace = frameAt(replay, START + 20 * 60_000).players.find(player => player.player.id === 'p2')!;
    expect(grace.position).toBeNull();
    expect(grace.path).toEqual([]);
  });

  it('shows the hiders station as it was chosen at the moment', () => {
    expect(frameAt(replay, START + 60_000).hidingStation).toBeNull();
    expect(frameAt(replay, START + 7 * 60_000).hidingStation?.station.name).toBe('Centralstationen');
    expect(frameAt(replay, START + 50 * 60_000).hidingStation?.station.name).toBe('Korsvägen');
  });

  it('shows each question unanswered until its answer came', () => {
    expect(frameAt(replay, START + 39 * 60_000).questions).toEqual([]);
    const asked = frameAt(replay, START + 41 * 60_000).questions;
    expect(asked).toHaveLength(1);
    expect(asked[0].status).toBe('PENDING');
    expect(asked[0].answer).toBeUndefined();
    expect(frameAt(replay, START + 42 * 60_000).questions[0].answer).toEqual({ choice: 'YES' });
  });

  it('knows the latest event', () => {
    expect(frameAt(replay, START + 41 * 60_000).lastEvent?.event.type).toBe('QUESTION_ASKED');
  });

  it('finds the last time not after a moment', () => {
    expect(lastAtOrBefore([1, 3, 5], 0)).toBe(-1);
    expect(lastAtOrBefore([1, 3, 5], 3)).toBe(1);
    expect(lastAtOrBefore([1, 3, 5], 4)).toBe(1);
    expect(lastAtOrBefore([1, 3, 5], 9)).toBe(2);
  });
});
