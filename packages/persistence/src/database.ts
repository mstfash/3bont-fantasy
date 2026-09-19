import { Kysely, PostgresDialect, type ColumnType } from 'kysely';
import type { Pool } from 'pg';
import type {
  ProviderSchedule,
  ProviderCollection,
  PriceCalibrationReport,
  AccountExport,
  ProviderSeasonBinding,
  ProviderIdentity,
  WorkerTask,
  WorkerRunSummary,
  ProviderAccount,
  ProviderRequest,
  PrizeCorrectionCase,
  PrizeCorrectionObservation,
  SponsorCampaign,
  ChatSettings,
  AchievementDefinition,
  AchievementGrant,
  PrizePool,
  PrizeProposal,
  ChipGrant,
  HeadToHeadEdition,
  LeagueGroup,
  PricePreview,
  FixtureObservation,
  RoundCalculation,
  Club,
  Competition,
  Entry,
  Fixture,
  Footballer,
  Gameweek,
  PoolPlayer,
  Season,
} from '@fantasy/contracts';

type Timestamp = ColumnType<Date, Date | string, Date | string>;
type DefaultTimestamp = ColumnType<
  Date,
  Date | string | undefined,
  Date | string
>;
type Document<T> = ColumnType<T, T, T>;

export interface Database {
  provider_schedules: {
    id: string;
    account_id: string;
    binding_id: string;
    revision: number;
    data: Document<ProviderSchedule>;
  };
  provider_collection_batches: {
    id: string;
    schedule_id: string;
    fixture_id: string;
    mapping_id: string;
    mapping_revision: number;
    state: ProviderCollection['state'];
    planned_at: Timestamp;
    next_attempt_at: Timestamp;
    claim_id: string | null;
    claimed_until: Timestamp | null;
    data: Document<ProviderCollection>;
  };
  provider_collection_attempts: {
    batch_id: string;
    step: number;
    attempt_id: string;
  };
  provider_normalization_sources: {
    report_evidence_id: string;
    attempt_id: string;
  };
  provider_normalization_mappings: {
    report_evidence_id: string;
    mapping_id: string;
    revision: number;
  };

  price_calibration_runs: {
    id: string;
    competition_id: string;
    actor_id: string;
    created_at: DefaultTimestamp;
    payload: Document<PriceCalibrationReport>;
  };
  price_calibration_sources: {
    report_id: string;
    gameweek_id: string;
    revision: number;
  };
  provider_season_bindings: {
    id: string;
    provider: 'api-football-direct';
    season_id: string;
    league_id: string;
    season_year: number;
    evidence_id: string;
    data: Document<ProviderSeasonBinding>;
  };
  provider_identities: {
    id: string;
    binding_id: string;
    kind: 'club' | 'footballer' | 'fixture';
    external_id: string;
    entity_id: string;
    revision: number;
    data: Document<ProviderIdentity>;
  };
  provider_identity_history: {
    mapping_id: string;
    revision: number;
    evidence_id: string;
    data: Document<ProviderIdentity>;
  };
  account_exports: {
    id: string;
    account_id: string;
    state: 'queued' | 'ready' | 'failed';
    requested_at: Timestamp;
    expires_at: Timestamp | null;
    data: Document<AccountExport>;
  };
  account_export_chunks: { export_id: string; sequence: number; body: string };
  worker_runs: {
    id: string;
    instance_id: string;
    task: WorkerTask;
    started_at: DefaultTimestamp;
    finished_at: Timestamp | null;
    status: 'running' | 'ok' | 'attention' | 'failed';
    summary: Document<WorkerRunSummary> | null;
  };
  provider_accounts: {
    id: string;
    provider: 'api-football-direct';
    revision: number;
    data: Document<ProviderAccount>;
    minute_headroom: number | null;
    minute_headroom_until: Timestamp | null;
    observed_minute_limit: number | null;
    inflight_attempt_id: string | null;
    cooldown_until: Timestamp | null;
    inflight_until: Timestamp | null;
    next_dispatch_at: Timestamp | null;
    consecutive_failures: ColumnType<number, number | undefined, number>;
    last_success_at: Timestamp | null;
    last_error_code: string | null;
  };
  provider_quota_windows: {
    account_id: string;
    starts_at: Timestamp;
    ends_at: Timestamp;
    ceiling: number;
    ordinary_ceiling: number;
    used: number;
    ordinary_used: number;
  };
  provider_attempts: {
    id: string;
    account_id: string;
    window_start: Timestamp;
    request: Document<ProviderRequest>;
    request_fingerprint: string;
    priority: 'ordinary' | 'correction';
    reserved_at: Timestamp;
    dispatch_expires_at: Timestamp;
    finished_at: Timestamp | null;
    outcome:
      | 'success'
      | 'provider-error'
      | 'rate-limited'
      | 'unconfirmed'
      | 'schema-invalid'
      | 'dispatch-expired'
      | null;
    http_status: number | null;
    response_checksum: string | null;
    evidence_id: string | null;
  };
  prize_correction_cases: {
    id: string;
    competition_id: string;
    pool_id: string;
    proposal_id: string;
    revision: number;
    data: Document<PrizeCorrectionCase>;
  };
  prize_correction_observations: {
    case_id: string;
    revision: number;
    observed_at: Timestamp;
    payload: Document<PrizeCorrectionObservation>;
  };
  entry_retirements: {
    entry_id: string;
    competition_id: string;
    retired_at: Timestamp;
  };
  sponsor_assets: {
    id: string;
    competition_id: string | null;
    label: string;
    content: Buffer;
    width: number;
    height: number;
    checksum: string;
    authorization_reference: string;
    uploaded_by: string;
    created_at: DefaultTimestamp;
  };
  sponsor_campaigns: {
    id: string;
    competition_id: string | null;
    revision: number;
    data: Document<SponsorCampaign>;
  };
  sponsor_daily_metrics: {
    campaign_id: string;
    revision: number;
    day: string;
    locale: 'ar' | 'en';
    kind: 'impression' | 'click';
    count: number;
  };
  sponsor_metric_receipts: {
    fingerprint: string;
    kind: 'impression' | 'click';
    expires_at: Timestamp;
  };
  chat_moderation_events: {
    id: string;
    group_id: string;
    actor_id: string;
    action: string;
    reason: string;
    created_at: Timestamp;
    expires_at: Timestamp;
  };
  chat_settings: { group_id: string; data: Document<ChatSettings> };
  chat_messages: {
    id: string;
    sequence: ColumnType<string, never, never>;
    group_id: string;
    account_id: string;
    body: string;
    created_at: DefaultTimestamp;
    removed_at: Timestamp | null;
  };
  chat_post_events: { account_id: string; occurred_at: Timestamp };
  chat_preferences: { group_id: string; account_id: string; muted: boolean };
  chat_blocks: { account_id: string; blocked_id: string };
  chat_timeouts: {
    group_id: string;
    account_id: string;
    until_at: Timestamp;
    reason: string;
    actor_id: string;
  };
  chat_reports: {
    id: string;
    group_id: string;
    message_id: string;
    reporter_id: string;
    author_id: string;
    body: string;
    reason: string;
    created_at: Timestamp;
    expires_at: Timestamp;
    state: 'open' | 'actioned' | 'dismissed';
    resolved_by: string | null;
    resolution: string | null;
    resolved_at: Timestamp | null;
  };
  achievement_definitions: {
    id: string;
    version: number;
    competition_id: string;
    revision: number;
    data: Document<AchievementDefinition>;
  };
  achievement_grants: {
    id: string;
    definition_id: string;
    version: number;
    competition_id: string;
    account_id: string;
    entry_id: string | null;
    scope_key: string;
    data: Document<AchievementGrant>;
  };
  group_membership_history: {
    sequence: ColumnType<string, never, never>;
    group_id: string;
    entry_id: string;
    status: 'pending' | 'active' | 'left' | 'removed';
    occurred_at: Timestamp;
  };
  prize_pools: {
    id: string;
    competition_id: string;
    group_id: string | null;
    revision: number;
    data: Document<PrizePool>;
  };
  prize_eligibility: {
    pool_id: string;
    account_id: string;
    excluded: boolean;
    reason: string;
    evidence_reference: string;
    reviewed_by: string;
    reviewed_at: DefaultTimestamp;
  };
  prize_proposals: {
    id: string;
    pool_id: string;
    competition_id: string;
    revision: number;
    data: Document<PrizeProposal>;
  };
  chip_grants: {
    id: string;
    competition_id: string;
    gameweek_id: string;
    data: Document<ChipGrant>;
  };
  chip_grant_receipts: {
    grant_id: string;
    entry_id: string;
    competition_id: string;
    applied_at: DefaultTimestamp;
  };
  h2h_editions: {
    id: string;
    group_id: string;
    competition_id: string;
    revision: number;
    data: Document<HeadToHeadEdition>;
  };
  h2h_registrations: {
    edition_id: string;
    competition_id: string;
    entry_id: string;
    registered_at: DefaultTimestamp;
  };
  h2h_forfeits: {
    edition_id: string;
    competition_id: string;
    entry_id: string;
    gameweek_id: string;
    reason: string;
    created_at: DefaultTimestamp;
  };
  group_handovers: {
    group_id: string;
    id: string;
    from_account_id: string;
    to_account_id: string;
    recipient_entry_id: string;
    group_revision: number;
    created_at: Timestamp;
    expires_at: Timestamp;
  };
  league_groups: {
    id: string;
    competition_id: string;
    organizer_id: string;
    invitation_hash: string;
    revision: number;
    data: Document<LeagueGroup>;
  };
  group_memberships: {
    group_id: string;
    competition_id: string;
    entry_id: string;
    account_id: string;
    status: 'pending' | 'active' | 'left' | 'removed';
    joined_at: DefaultTimestamp;
    changed_at: DefaultTimestamp;
  };
  price_batches: {
    id: string;
    competition_id: string;
    editing_gameweek_id: string;
    actor_id: string;
    fingerprint: string;
    payload: Document<PricePreview>;
    created_at: DefaultTimestamp;
  };
  price_batch_sources: {
    competition_id: string;
    gameweek_id: string;
    batch_id: string;
  };
  gameweek_player_pools: {
    gameweek_id: string;
    payload: Document<{ players: PoolPlayer[] }>;
  };
  fixture_observations: {
    fixture_id: string;
    revision: number;
    evidence_id: string;
    payload: Document<FixtureObservation>;
    created_at: DefaultTimestamp;
  };
  round_calculations: {
    gameweek_id: string;
    revision: number;
    fingerprint: string;
    payload: Document<RoundCalculation>;
    created_at: DefaultTimestamp;
  };
  staff_session_proofs: {
    session_id: string;
    account_id: string;
    mfa_verified_at: Timestamp;
    password_verified_at: Timestamp;
  };
  staff_verification_limits: {
    account_id: string;
    window_started_at: Timestamp;
    attempts: number;
  };
  accounts: {
    closed_at: ColumnType<
      Date | null,
      Date | string | null | undefined,
      Date | string | null
    >;
    id: string;
    display_name: string;
    suspended_until: Timestamp | null;
    created_at: DefaultTimestamp;
  };
  staff_grants: {
    id: string;
    account_id: string;
    role: string;
    competition_id: string | null;
    granted_by: string;
    created_at: DefaultTimestamp;
  };
  seasons: { id: string; data: Document<Season> };
  clubs: { id: string; season_id: string; data: Document<Club> };
  footballers: {
    id: string;
    season_id: string;
    club_id: string;
    data: Document<Footballer>;
  };
  fixtures: {
    id: string;
    season_id: string;
    kickoff: Timestamp;
    data: Document<Fixture>;
  };
  competitions: {
    id: string;
    season_id: string;
    slug: string;
    revision: number;
    data: Document<Competition>;
  };
  competition_players: {
    competition_id: string;
    footballer_id: string;
    data: Document<PoolPlayer>;
  };
  gameweeks: {
    id: string;
    competition_id: string;
    number: number;
    deadline: Timestamp;
    data: Document<Gameweek>;
  };
  fixture_assignments: {
    competition_id: string;
    fixture_id: string;
    gameweek_id: string;
  };
  entries: {
    id: string;
    competition_id: string;
    account_id: string;
    revision: number;
    data: Document<Entry>;
  };
  entry_snapshots: {
    entry_id: string;
    competition_id: string;
    gameweek_id: string;
    locked_at: Timestamp;
    payload: unknown;
  };
  entry_results: {
    entry_id: string;
    competition_id: string;
    gameweek_id: string;
    revision: number;
    points: number;
    payload: unknown;
    published_at: Timestamp;
  };
  provider_evidence: {
    id: string;
    provider: string;
    resource: string;
    received_at: DefaultTimestamp;
    checksum: string;
    payload: unknown;
  };
  fact_revisions: {
    id: string;
    fixture_id: string;
    footballer_id: string;
    revision: number;
    evidence_id: string | null;
    is_override: boolean;
    actor_id: string | null;
    reason: string | null;
    created_at: DefaultTimestamp;
    payload: unknown;
  };
  result_reviews: {
    id: string;
    gameweek_id: string;
    reason: string;
    status: string;
    evidence_id: string | null;
    created_at: DefaultTimestamp;
    resolved_at: Timestamp | null;
    resolved_by: string | null;
  };
  commands: {
    actor_id: string;
    command_id: string;
    fingerprint: string;
    accepted_at: Timestamp;
    result: unknown;
  };
  audit_events: {
    id: string;
    actor_id: string;
    action: string;
    scope_id: string | null;
    reason: string | null;
    created_at: DefaultTimestamp;
    payload: unknown;
  };
}

/** The supplied pool remains the single source of PostgreSQL connections. */
export function createDatabase(pool: Pool): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
  }).withSchema('fantasy');
}
