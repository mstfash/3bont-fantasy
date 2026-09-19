import type { Discipline } from '@fantasy/domain';

export interface TimelinePlayer {
  readonly id: number;
  readonly teamId: number;
  readonly starter: boolean;
  readonly minutes: number | null;
  readonly goals: number | null;
  readonly yellow: number | null;
  readonly red: number | null;
}
export interface TimelineEvent {
  readonly team: { readonly id: number };
  readonly player: { readonly id: number | null };
  readonly assist?: { readonly id: number | null } | undefined;
  readonly time?:
    | {
        readonly elapsed: number | null;
        readonly extra?: number | null | undefined;
      }
    | undefined;
  readonly type: string;
  readonly detail: string;
}
export interface TimelineFacts {
  readonly goals: number;
  readonly ownGoals: number;
  readonly penaltyMisses: number;
  readonly concededWhileOnPitch: number;
  readonly concededAfterDismissal: number;
  readonly discipline: Discipline;
}
export type TimelineIssue =
  | 'timeline-lineup-incomplete'
  | 'timeline-time-missing'
  | 'timeline-event-ambiguous'
  | 'timeline-score-conflict'
  | 'timeline-participation-conflict'
  | 'timeline-cards-conflict';
interface Participation {
  active: boolean;
  appeared: boolean;
  entered: number;
  left: number | null;
  dismissed: boolean;
  yellows: number;
  dismissal: 'second-yellow' | 'straight-red' | null;
  goals: number;
  ownGoals: number;
  penaltyMisses: number;
  concededWhileOnPitch: number;
  concededAfterDismissal: number;
}

/** Ordinary FT evidence only. Minute ties never acquire an invented second-level order. */
export function deriveProviderTimeline(input: {
  readonly home: number;
  readonly away: number;
  readonly homeGoals: number | null;
  readonly awayGoals: number | null;
  readonly players: readonly TimelinePlayer[];
  readonly events: readonly TimelineEvent[];
}): {
  facts: ReadonlyMap<number, TimelineFacts>;
  issues: readonly TimelineIssue[];
} {
  const hold = (issue: TimelineIssue) => ({
    facts: new Map<number, TimelineFacts>(),
    issues: [issue],
  });
  const players = new Map(input.players.map((p) => [p.id, p]));
  if (
    players.size !== input.players.length ||
    input.home === input.away ||
    input.players.some(
      (p) => p.teamId !== input.home && p.teamId !== input.away,
    ) ||
    [input.home, input.away].some(
      (team) =>
        input.players.filter((p) => p.teamId === team && p.starter).length !==
        11,
    )
  )
    return hold('timeline-lineup-incomplete');
  if (input.homeGoals === null || input.awayGoals === null)
    return hold('timeline-score-conflict');
  const timed = [];
  const duplicates = new Set<string>();
  for (const event of input.events) {
    const elapsed = event.time?.elapsed,
      extra = event.time?.extra ?? 0;
    if (
      elapsed === null ||
      elapsed === undefined ||
      !Number.isSafeInteger(elapsed) ||
      elapsed < 0 ||
      elapsed > 90 ||
      !Number.isSafeInteger(extra) ||
      extra < 0 ||
      extra > 30 ||
      (extra > 0 && elapsed !== 45 && elapsed !== 90)
    )
      return hold('timeline-time-missing');
    if (
      !['Goal', 'Card', 'subst'].includes(event.type) ||
      event.player.id === null ||
      !players.has(event.player.id)
    )
      return hold('timeline-event-ambiguous');
    const stamp = elapsed * 100 + extra;
    const fingerprint = JSON.stringify([
      stamp,
      event.type,
      event.detail,
      event.team.id,
      event.player.id,
      event.assist?.id ?? null,
    ]);
    if (duplicates.has(fingerprint)) return hold('timeline-event-ambiguous');
    duplicates.add(fingerprint);
    timed.push({ event, stamp, elapsed });
  }
  timed.sort((a, b) => a.stamp - b.stamp);
  for (const item of timed) {
    if (item.event.type !== 'Goal') continue;
    if (
      timed.some(
        (other) =>
          other.stamp === item.stamp &&
          (other.event.type === 'subst' ||
            (other.event.type === 'Card' &&
              other.event.detail !== 'Yellow Card')),
      )
    )
      return hold('timeline-event-ambiguous');
  }
  const states = new Map<number, Participation>(
    input.players.map((p) => [
      p.id,
      {
        active: p.starter,
        appeared: p.starter,
        entered: 0,
        left: null,
        dismissed: false,
        yellows: 0,
        dismissal: null,
        goals: 0,
        ownGoals: 0,
        penaltyMisses: 0,
        concededWhileOnPitch: 0,
        concededAfterDismissal: 0,
      },
    ]),
  );
  const score = new Map([
    [input.home, 0],
    [input.away, 0],
  ]);
  for (const { event, elapsed, stamp } of timed) {
    const actorId = event.player.id;
    if (actorId === null) return hold('timeline-event-ambiguous');
    const actor = players.get(actorId),
      state = states.get(actorId);
    if (!actor || !state) return hold('timeline-event-ambiguous');
    if (event.type === 'subst') {
      const partner =
        event.assist?.id === null || event.assist?.id === undefined
          ? undefined
          : players.get(event.assist.id);
      const partnerState = partner ? states.get(partner.id) : undefined;
      if (
        !partner ||
        !partnerState ||
        partner.id === actorId ||
        partner.teamId !== actor.teamId ||
        event.team.id !== actor.teamId ||
        state.active === partnerState.active
      )
        return hold('timeline-participation-conflict');
      // Resolve the direction from the established pitch state, never from a name or array order.
      const outgoing = state.active ? state : partnerState;
      const incoming = state.active ? partnerState : state;
      if (incoming.appeared || incoming.dismissed)
        return hold('timeline-participation-conflict');
      outgoing.active = false;
      outgoing.left = elapsed;
      incoming.active = true;
      incoming.appeared = true;
      incoming.entered = elapsed;
    } else if (event.type === 'Card') {
      if (event.team.id !== actor.teamId || state.dismissed)
        return hold('timeline-cards-conflict');
      if (event.detail === 'Yellow Card') {
        state.yellows++;
        if (state.yellows > 2) return hold('timeline-cards-conflict');
      } else if (
        event.detail === 'Yellow-Red Card' ||
        event.detail === 'Red Card'
      ) {
        if (!state.active) return hold('timeline-participation-conflict');
        if (event.detail === 'Yellow-Red Card') {
          if (state.yellows < 1 || state.yellows > 2)
            return hold('timeline-cards-conflict');
          state.yellows = 2;
          state.dismissal = 'second-yellow';
        } else {
          if (
            state.yellows > 1 ||
            timed.some(
              (other) =>
                other.stamp === stamp &&
                other.event.player.id === actorId &&
                other.event.detail === 'Yellow Card',
            )
          )
            return hold('timeline-cards-conflict');
          state.dismissal = 'straight-red';
        }
        state.active = false;
        state.dismissed = true;
        state.left = elapsed;
      } else return hold('timeline-cards-conflict');
    } else {
      if (!state.active) return hold('timeline-participation-conflict');
      if (
        !['Normal Goal', 'Own Goal', 'Penalty', 'Missed Penalty'].includes(
          event.detail,
        )
      )
        return hold('timeline-event-ambiguous');
      const beneficiary =
        event.detail === 'Own Goal'
          ? actor.teamId === input.home
            ? input.away
            : input.home
          : actor.teamId;
      if (event.team.id !== beneficiary)
        return hold('timeline-event-ambiguous');
      if (event.detail === 'Missed Penalty') {
        state.penaltyMisses++;
        continue;
      }
      if (event.detail === 'Own Goal') state.ownGoals++;
      else state.goals++;
      score.set(beneficiary, (score.get(beneficiary) ?? 0) + 1);
      for (const player of input.players) {
        if (player.teamId === beneficiary) continue;
        const participant = states.get(player.id);
        if (!participant) return hold('timeline-participation-conflict');
        if (participant.active) participant.concededWhileOnPitch++;
        else if (participant.dismissed) participant.concededAfterDismissal++;
      }
    }
  }
  if (
    score.get(input.home) !== input.homeGoals ||
    score.get(input.away) !== input.awayGoals
  )
    return hold('timeline-score-conflict');
  const facts = new Map<number, TimelineFacts>();
  const issues = new Set<TimelineIssue>();
  for (const player of input.players) {
    const state = states.get(player.id);
    if (!state) return hold('timeline-participation-conflict');
    if (!state.appeared) {
      // No inferred zero-minute performance for reserves missing from the statistics feed.
      if (
        (player.minutes !== null && player.minutes > 0) ||
        (player.goals !== null && player.goals > 0)
      )
        return hold('timeline-participation-conflict');
      // Explicit zeroes are usable; omission from a feed is still unknown.
      if (
        player.minutes === 0 &&
        player.goals === 0 &&
        player.yellow === 0 &&
        player.red === 0
      )
        facts.set(player.id, {
          goals: 0,
          ownGoals: 0,
          penaltyMisses: 0,
          concededWhileOnPitch: 0,
          concededAfterDismissal: 0,
          discipline: { kind: 'none' },
        });
      continue;
    }
    if (
      player.minutes === null ||
      player.minutes !== (state.left ?? 90) - state.entered ||
      (player.goals !== null && player.goals !== state.goals)
    )
      return hold('timeline-participation-conflict');
    if (player.red !== (state.dismissed ? 1 : 0))
      return hold('timeline-cards-conflict');
    let discipline: Discipline;
    if (
      player.yellow === state.yellows &&
      player.red === (state.dismissed ? 1 : 0) &&
      (state.yellows < 2 || state.dismissal === 'second-yellow')
    ) {
      discipline =
        state.dismissal === 'second-yellow'
          ? { kind: 'second-yellow' }
          : state.dismissal === 'straight-red'
            ? { kind: 'straight-red', priorYellow: state.yellows === 1 }
            : { kind: state.yellows === 1 ? 'yellow' : 'none' };
    } else {
      issues.add('timeline-cards-conflict');
      continue;
    }
    facts.set(player.id, {
      goals: state.goals,
      ownGoals: state.ownGoals,
      penaltyMisses: state.penaltyMisses,
      concededWhileOnPitch: state.concededWhileOnPitch,
      concededAfterDismissal: state.concededAfterDismissal,
      discipline,
    });
  }
  return { facts, issues: [...issues] };
}
