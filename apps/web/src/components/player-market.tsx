'use client';
import { TopicHelp } from './help/page-help';
import { useState } from 'react';
import { POSITIONS, type Position, type SquadRules } from '@fantasy/domain';
import { MarketValuation } from './market-valuation';
import type { Locale } from '@/lib/brand';
import type { MarketPlayer } from '@/lib/market';
import { positionNames } from '@/lib/football-labels';

export function PlayerMarket({
  locale,
  players,
  selected,
  rules,
  disabled,
  onToggle,
}: {
  readonly locale: Locale;
  readonly players: readonly MarketPlayer[];
  readonly selected: readonly string[];
  readonly rules: SquadRules;
  readonly disabled: boolean;
  readonly onToggle: (id: string) => void;
}) {
  const ar = locale === 'ar';
  const [search, setSearch] = useState('');
  const [position, setPosition] = useState<Position | 'all'>('all');
  const selectedPlayers = players
    .filter((p) => selected.includes(p.footballer.id))
    .map((p) => p.pool);
  const filtered = players.filter(
    (p) =>
      (position === 'all' || p.pool.position === position) &&
      `${p.footballer.name[locale]} ${p.club.name[locale]}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
  );
  return (
    <section className="player-market">
      <TopicHelp locale={locale} topic="market" />
      <div className="market-heading">
        <h2>{ar ? 'سوق اللاعبين' : 'THE PLAYER MARKET'}</h2>
        <p>
          {ar
            ? 'الأسعار الخيالية منفصلة عن القيمة السوقية الحقيقية.'
            : 'Fantasy selection prices are separate from real-world market values.'}
        </p>
      </div>
      <div className="market-filters">
        <input
          aria-label={ar ? 'ابحث عن لاعب أو نادٍ' : 'Search player or club'}
          placeholder={ar ? 'ابحث عن لاعب أو نادٍ' : 'Search player or club'}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
          }}
        />
        <select
          aria-label={ar ? 'المركز' : 'Position'}
          value={position}
          onChange={(e) => {
            const value = e.target.value;
            if (value === 'all' || POSITIONS.includes(value as Position))
              setPosition(value as Position | 'all');
          }}
        >
          <option value="all">{ar ? 'كل المراكز' : 'All positions'}</option>
          {POSITIONS.map((p) => (
            <option key={p} value={p}>
              {positionNames[p][locale]}
            </option>
          ))}
        </select>
      </div>
      <div className="quota-row">
        {POSITIONS.map((p) => (
          <span key={p}>
            {positionNames[p][locale]}{' '}
            <strong>
              {selectedPlayers.filter((s) => s.position === p).length}/
              {rules.quotas[p]}
            </strong>
          </span>
        ))}
        <span>
          {ar ? 'حد النادي' : 'Club limit'} <strong>{rules.clubCap}</strong>
        </span>
      </div>
      <div className="market-list">
        {filtered.map((p) => (
          <article
            className={
              selected.includes(p.footballer.id)
                ? 'market-player selected'
                : 'market-player'
            }
            key={p.footballer.id}
          >
            <div
              className="player-club-mark"
              style={{ borderColor: p.club.color }}
            >
              {p.club.shortName}
            </div>
            <div className="player-identity">
              <strong>{p.footballer.name[locale]}</strong>
              <span>
                {p.club.name[locale]} · {positionNames[p.pool.position][locale]}
              </span>
              <MarketValuation
                locale={locale}
                valuation={p.footballer.valuation}
                stale={p.valuationStale}
              />
            </div>
            <strong className="fantasy-price">
              {(p.pool.price / 10).toFixed(1)}
            </strong>
            <button
              type="button"
              aria-label={`${selected.includes(p.footballer.id) ? (ar ? 'إزالة' : 'Remove') : ar ? 'إضافة' : 'Add'} ${p.footballer.name[locale]}`}
              disabled={
                disabled ||
                (!selected.includes(p.footballer.id) &&
                  (!p.pool.selectable || selected.length >= rules.squadSize))
              }
              onClick={() => {
                onToggle(p.footballer.id);
              }}
            >
              {selected.includes(p.footballer.id) ? '−' : '+'}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
