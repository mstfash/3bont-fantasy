import type { PointUnits } from './quantities.ts';

export interface HeadToHeadFixture {
  readonly gameweekId: string;
  readonly homeId: string;
  readonly awayId: string | null;
  readonly cycle: number;
}

/** Persist the seed, roster and returned schedule as one immutable edition. */
export function scheduleHeadToHead(
  entryIds: readonly string[],
  gameweekIds: readonly string[],
  seed: string,
): readonly HeadToHeadFixture[] {
  if (
    entryIds.length < 2 ||
    new Set(entryIds).size !== entryIds.length ||
    new Set(gameweekIds).size !== gameweekIds.length ||
    !seed
  )
    throw new RangeError('Invalid H2H edition inputs');
  let state = 2166136261;
  for (const char of seed)
    state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
  const random = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const shuffled: (string | null)[] = [...entryIds].sort();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = shuffled[i];
    const b = shuffled[j];
    if (a !== undefined && b !== undefined) {
      shuffled[i] = b;
      shuffled[j] = a;
    }
  }
  if (shuffled.length % 2 !== 0) shuffled.push(null);
  const roundCount = shuffled.length - 1;
  const cycles = Math.floor(gameweekIds.length / roundCount);
  const fixtures: HeadToHeadFixture[] = [];
  for (let cycle = 0; cycle < cycles; cycle++) {
    let roster = [...shuffled];
    for (let round = 0; round < roundCount; round++) {
      const gameweekId = gameweekIds[cycle * roundCount + round];
      if (!gameweekId) throw new RangeError('Missing gameweek');
      for (let pair = 0; pair < roster.length / 2; pair++) {
        const a = roster[pair];
        const b = roster[roster.length - 1 - pair];
        if (a === undefined || b === undefined || (a === null && b === null))
          throw new RangeError('Invalid H2H pairing');
        if (a === null || b === null)
          fixtures.push({
            gameweekId,
            homeId: a ?? b ?? '',
            awayId: null,
            cycle: cycle + 1,
          });
        else
          fixtures.push({
            gameweekId,
            homeId: (cycle + round) % 2 === 0 ? a : b,
            awayId: (cycle + round) % 2 === 0 ? b : a,
            cycle: cycle + 1,
          });
      }
      const first = roster[0];
      const last = roster[roster.length - 1];
      if (first === undefined || last === undefined)
        throw new RangeError('Invalid H2H rotation');
      roster = [first, last, ...roster.slice(1, -1)];
    }
  }
  return fixtures;
}

export function scoreHeadToHead(
  home: PointUnits,
  away: PointUnits | null,
  homeForfeit = false,
  awayForfeit = false,
): {
  readonly home: number;
  readonly away: number;
  readonly outcome: 'bye' | 'draw' | 'home' | 'away' | 'double-forfeit';
} {
  if (away === null) return { home: 0, away: 0, outcome: 'bye' };
  if (homeForfeit && awayForfeit)
    return { home: 0, away: 0, outcome: 'double-forfeit' };
  if (homeForfeit) return { home: 0, away: 3, outcome: 'away' };
  if (awayForfeit) return { home: 3, away: 0, outcome: 'home' };
  if (home === away) return { home: 1, away: 1, outcome: 'draw' };
  return home > away
    ? { home: 3, away: 0, outcome: 'home' }
    : { home: 0, away: 3, outcome: 'away' };
}
