-- ===========================================================================
-- IPO Tracker — database schema (Supabase / Postgres)
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- ipos : one row per IPO, keyed by slug.
--
-- Column ownership:
--   * scraped_*  columns are owned by the scheduler and overwritten each run
--   * manual     jsonb is owned by YOU and never touched by automation
--   * locked     array names columns the scraper must not overwrite
-- ---------------------------------------------------------------------------
create table if not exists public.ipos (
  slug                 text primary key,
  name                 text not null,
  short_name           text,
  board                text default 'Mainboard',      -- Mainboard | SME
  status               text default 'upcoming',       -- upcoming|open|closed|listed
  symbol               text,                          -- NSE/BSE symbol

  -- Issue details
  price_band_low       numeric,
  price_band_high      numeric,
  lot_size             integer,
  min_investment       numeric,
  issue_size           text,
  issue_size_shares    bigint,
  face_value           numeric,

  -- Grey market
  gmp                  numeric,
  gmp_updated_at       timestamptz,
  estimated_listing    numeric,

  -- Timetable
  open_date            date,
  close_date           date,
  allotment_date       date,
  refund_date          date,
  demat_date           date,
  listing_date         date,

  -- Registrar / lead managers
  registrar            text,
  registrar_url        text,
  lead_managers        text[],

  -- Subscription (times)
  subscription_qib     numeric,
  subscription_nii     numeric,
  subscription_retail  numeric,
  subscription_emp     numeric,
  subscription_total   numeric,

  -- Listing outcome
  listing_price        numeric,
  listing_gain_pct     numeric,

  -- Editorial content you control (about, financials, strengths, risks, faq)
  manual               jsonb not null default '{}'::jsonb,
  -- Column names the scraper must never overwrite, e.g. {gmp,lot_size}
  locked               text[] not null default '{}',

  source               text,                          -- which scraper wrote this
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- gmp_history : append-only snapshots for the trend chart
-- ---------------------------------------------------------------------------
create table if not exists public.gmp_history (
  id           bigint generated always as identity primary key,
  slug         text not null references public.ipos (slug) on delete cascade,
  gmp          numeric not null,
  recorded_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- subscription_history : append-only subscription snapshots
-- ---------------------------------------------------------------------------
create table if not exists public.subscription_history (
  id           bigint generated always as identity primary key,
  slug         text not null references public.ipos (slug) on delete cascade,
  qib          numeric,
  nii          numeric,
  retail       numeric,
  total        numeric,
  recorded_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- scrape_runs : health log so you can see if the scheduler is alive
-- ---------------------------------------------------------------------------
create table if not exists public.scrape_runs (
  id            bigint generated always as identity primary key,
  source        text not null,
  ok            boolean not null,
  records       integer default 0,
  message       text,
  duration_ms   integer,
  started_at    timestamptz not null default now()
);

-- Indexes
create index if not exists ipos_status_idx        on public.ipos (status);
create index if not exists ipos_open_date_idx     on public.ipos (open_date desc);
create index if not exists ipos_board_idx         on public.ipos (board);
create index if not exists gmp_history_idx        on public.gmp_history (slug, recorded_at desc);
create index if not exists sub_history_idx        on public.subscription_history (slug, recorded_at desc);
create index if not exists scrape_runs_idx        on public.scrape_runs (started_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security: anon key = read-only. The scheduler uses the
-- service_role key, which bypasses RLS entirely.
-- ---------------------------------------------------------------------------
alter table public.ipos                  enable row level security;
alter table public.gmp_history           enable row level security;
alter table public.subscription_history  enable row level security;
alter table public.scrape_runs           enable row level security;

drop policy if exists "public read ipos" on public.ipos;
create policy "public read ipos" on public.ipos
  for select to anon, authenticated using (true);

drop policy if exists "public read gmp_history" on public.gmp_history;
create policy "public read gmp_history" on public.gmp_history
  for select to anon, authenticated using (true);

drop policy if exists "public read subscription_history" on public.subscription_history;
create policy "public read subscription_history" on public.subscription_history
  for select to anon, authenticated using (true);

-- scrape_runs stays private (no anon policy) — internal health data.

-- ---------------------------------------------------------------------------
-- Auto-update updated_at
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists ipos_touch_updated_at on public.ipos;
create trigger ipos_touch_updated_at
  before update on public.ipos
  for each row execute function public.touch_updated_at();
