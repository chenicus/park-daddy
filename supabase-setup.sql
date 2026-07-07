-- Park Daddy — crowd-sourced "this spot is wrong" reports.
-- Run this once in your Supabase project: SQL Editor → paste → Run.
-- Then copy Project URL + anon key (Settings → API) into config.js.

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

-- 3. photo storage bucket ----------------------------------------------------
insert into storage.buckets (id, name, public)
values ('report-photos', 'report-photos', true)
on conflict (id) do nothing;

drop policy if exists "report photos public read" on storage.objects;
create policy "report photos public read" on storage.objects
  for select using (bucket_id = 'report-photos');

drop policy if exists "report photos public upload" on storage.objects;
create policy "report photos public upload" on storage.objects
  for insert with check (bucket_id = 'report-photos');
