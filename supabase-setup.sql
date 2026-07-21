-- Park Daddy — crowd-sourced "this spot is wrong" reports.
-- Run this once (and re-run after any change) in your Supabase project:
--   SQL Editor → paste → Run.  Then copy Project URL + anon key (Settings → API) into config.js.
-- Safe to re-run: every statement is idempotent.

-- 1. reports table -----------------------------------------------------------
create table if not exists public.reports (
  id          bigint generated always as identity primary key,
  block_key   text        not null,   -- stable location key from reports.js rptKey()
  block_label text,                    -- human label for your review (e.g. "1100 block Alberni St")
  reason      text        not null,    -- 'not_free' | 'rate_wrong' | 'permit' | 'no_parking' | 'other'
  detail      text,                    -- free text (required when reason = 'other')
  photo_url   text,                    -- public URL of the sign photo, nullable
  lat         double precision,
  lon         double precision,
  created_at  timestamptz not null default now()
);

create index if not exists reports_block_key_idx on public.reports (block_key);
create index if not exists reports_created_at_idx on public.reports (created_at desc);

-- 2. row level security ------------------------------------------------------
-- Anyone may read reports (needed to show flags on the map) and add a report.
-- No update/delete policy → the public can't edit or erase reports; you moderate
-- from the Supabase dashboard (which uses the service_role key, bypassing RLS).
alter table public.reports enable row level security;

drop policy if exists "reports public read" on public.reports;
create policy "reports public read" on public.reports
  for select using (true);

drop policy if exists "reports public insert" on public.reports;
create policy "reports public insert" on public.reports
  for insert with check (true);

-- 2b. abuse guard (BEFORE INSERT trigger) ------------------------------------
-- The anon key is public, so `with check (true)` alone lets anyone POST unlimited rows —
-- enough to flood the table or (since 3 reports hide a pill) hide swathes of the map. This
-- trigger validates every field and throttles volume. NOTE: this raises the bar but is not
-- bulletproof against a determined attacker with the anon key — for a hard guarantee put a
-- captcha (e.g. Cloudflare Turnstile) or an Edge Function in front of inserts, and/or raise
-- the hide threshold + moderate. Tune the limits below to your traffic.
create or replace function public.reports_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare recent int;
begin
  -- field validation (reject junk before it can render on anyone's map)
  if new.reason not in ('not_free','rate_wrong','permit','no_parking','other') then
    raise exception 'invalid reason';
  end if;
  if length(new.block_key) > 120 or length(coalesce(new.block_label, '')) > 160 then
    raise exception 'block key/label too long';
  end if;
  if length(coalesce(new.detail, '')) > 200 then
    raise exception 'detail too long';
  end if;
  if new.lat is not null and (new.lat < -90 or new.lat > 90) then raise exception 'bad lat'; end if;
  if new.lon is not null and (new.lon < -180 or new.lon > 180) then raise exception 'bad lon'; end if;

  -- coarse global flood guard: cap total inserts per minute
  select count(*) into recent from public.reports where created_at > now() - interval '1 minute';
  if recent >= 30 then raise exception 'rate limited — try again shortly'; end if;

  -- per-block cap: no more than 6 reports for one block per rolling 24h
  select count(*) into recent from public.reports
    where block_key = new.block_key and created_at > now() - interval '24 hours';
  if recent >= 6 then raise exception 'too many reports for this block today'; end if;

  -- dedup: reject an identical report within 10 minutes
  if exists (
    select 1 from public.reports
    where block_key = new.block_key and reason = new.reason
      and coalesce(detail, '') = coalesce(new.detail, '')
      and created_at > now() - interval '10 minutes'
  ) then
    raise exception 'duplicate report';
  end if;

  return new;
end;
$$;

drop trigger if exists reports_guard_trg on public.reports;
create trigger reports_guard_trg
  before insert on public.reports
  for each row execute function public.reports_guard();

-- 3. photo storage bucket ----------------------------------------------------
-- Public-read (photos display on the spot card) but uploads are constrained to small images.
-- Without the size/MIME limits below, anyone with the anon key could upload arbitrary files
-- (malware, phishing pages, huge blobs) served from your Supabase domain.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'report-photos', 'report-photos', true,
  5242880,                                                    -- 5 MB cap
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "report photos public read" on storage.objects;
create policy "report photos public read" on storage.objects
  for select using (bucket_id = 'report-photos');

drop policy if exists "report photos public upload" on storage.objects;
create policy "report photos public upload" on storage.objects
  for insert with check (bucket_id = 'report-photos');

-- 4. general app feedback (menu → Leave feedback) ----------------------------
-- Free-form feedback, not tied to a block. Public insert like reports, but NO public
-- read: nothing in the app displays these, so only you (dashboard / service_role) see them.
create table if not exists public.feedback (
  id         bigint generated always as identity primary key,
  message    text        not null,
  contact    text,                     -- optional email, only if they want a reply
  page       text,                     -- path + query the feedback was sent from
  created_at timestamptz not null default now()
);

create index if not exists feedback_created_at_idx on public.feedback (created_at desc);

alter table public.feedback enable row level security;

drop policy if exists "feedback public insert" on public.feedback;
create policy "feedback public insert" on public.feedback
  for insert with check (true);
-- (deliberately no select policy — the anon key can write but never read)

-- same abuse guard shape as reports: validate size, throttle volume, drop dupes.
create or replace function public.feedback_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare recent int;
begin
  if length(btrim(new.message)) < 1 then raise exception 'message too short'; end if;
  if length(new.message) > 1000 then raise exception 'message too long'; end if;
  if length(coalesce(new.contact, '')) > 120 then raise exception 'contact too long'; end if;
  if length(coalesce(new.page, '')) > 300 then raise exception 'page too long'; end if;

  select count(*) into recent from public.feedback where created_at > now() - interval '1 minute';
  if recent >= 10 then raise exception 'rate limited — try again shortly'; end if;

  if exists (
    select 1 from public.feedback
    where message = new.message and created_at > now() - interval '10 minutes'
  ) then
    raise exception 'duplicate feedback';
  end if;

  return new;
end;
$$;

drop trigger if exists feedback_guard_trg on public.feedback;
create trigger feedback_guard_trg
  before insert on public.feedback
  for each row execute function public.feedback_guard();
