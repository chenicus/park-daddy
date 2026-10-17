-- Community sign submissions are evidence, not published parking rules.
-- Apply in Supabase SQL Editor after reviewing the existing reports setup.

create table if not exists public.sign_submissions (
  id uuid primary key default gen_random_uuid(),
  capture_id uuid not null unique,
  city text not null,
  captured_at timestamptz not null,
  lat double precision not null,
  lon double precision not null,
  accuracy_m real,
  travel_heading_deg real,
  camera_heading_deg real,
  inferred_street text,
  inferred_side text,
  side_confidence real,
  inferred_lat double precision,
  inferred_lon double precision,
  ocr_text text,
  ocr_confidence real,
  suggested_rules jsonb,
  photo_path text not null,
  status text not null default 'pending',
  reviewer_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint sign_submissions_status check (status in ('pending','approved','rejected','needs_review')),
  constraint sign_submissions_coordinates check (lat between -90 and 90 and lon between -180 and 180),
  constraint sign_submissions_accuracy check (accuracy_m is null or accuracy_m between 0 and 1000),
  constraint sign_submissions_side_confidence check (side_confidence is null or side_confidence between 0 and 1),
  constraint sign_submissions_inferred_pair check ((inferred_lat is null) = (inferred_lon is null)),
  constraint sign_submissions_inferred_coordinates check (inferred_lat is null or (inferred_lat between -90 and 90 and inferred_lon between -180 and 180)),
  constraint sign_submissions_ocr_confidence check (ocr_confidence is null or ocr_confidence between 0 and 1),
  constraint sign_submissions_photo_path check (length(photo_path) between 1 and 240),
  constraint sign_submissions_text_length check (length(coalesce(ocr_text,'')) <= 4000)
);

create index if not exists sign_submissions_queue_idx
  on public.sign_submissions (created_at) where status in ('pending','needs_review');

alter table public.sign_submissions enable row level security;
grant insert on public.sign_submissions to anon;
grant select on public.sign_submissions to authenticated;

-- The public client can submit evidence, but cannot read anyone's pending scans
-- or approve a rule. Moderators use the Supabase dashboard/service role.
drop policy if exists "sign submissions insert" on public.sign_submissions;
create policy "sign submissions insert" on public.sign_submissions
  for insert to anon with check (
    status = 'pending' and reviewer_note is null and reviewed_at is null
    and city in ('vancouver','seattle','sf','sanjose','kirkland','surrey')
  );

create or replace function public.sign_submission_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare recent integer;
begin
  if new.captured_at > now() + interval '5 minutes'
     or new.captured_at < now() - interval '30 days' then
    raise exception 'capture time is outside the accepted range';
  end if;
  if length(coalesce(new.inferred_street,'')) > 160
     or length(coalesce(new.inferred_side,'')) > 40 then
    raise exception 'location text too long';
  end if;
  if new.suggested_rules is not null
     and octet_length(new.suggested_rules::text) > 8000 then
    raise exception 'rule suggestion too large';
  end if;
  if new.photo_path <> (new.city || '/' || new.capture_id::text || '.jpg')
     or not exists(select 1 from storage.objects
       where bucket_id='sign-evidence' and name=new.photo_path) then
    raise exception 'matching private sign photo required';
  end if;
  select count(*) into recent from public.sign_submissions
    where created_at > now() - interval '1 minute';
  if recent >= 30 then raise exception 'sign submission rate limited'; end if;
  return new;
end;
$$;

drop trigger if exists sign_submission_guard_trg on public.sign_submissions;
create trigger sign_submission_guard_trg before insert on public.sign_submissions
  for each row execute function public.sign_submission_guard();

-- Evidence remains private. A moderator must redact faces/plates and explicitly
-- choose any image that should be exposed with an approved map record.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sign-evidence','sign-evidence',false,5242880,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "sign evidence upload" on storage.objects;
create policy "sign evidence upload" on storage.objects for insert to anon
  with check (bucket_id = 'sign-evidence' and name ~
    '^(vancouver|seattle|sf|sanjose|kirkland|surrey)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$');

create table if not exists public.community_parking_rules (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  lat double precision not null,
  lon double precision not null,
  street text not null,
  side text,
  curb_geometry jsonb,
  schedule jsonb not null,
  source_submission_id uuid references public.sign_submissions(id),
  evidence_url text,
  last_checked_at timestamptz not null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  constraint community_rules_coordinates check (lat between -90 and 90 and lon between -180 and 180),
  constraint community_rules_schedule_size check (octet_length(schedule::text) <= 12000)
);

create index if not exists community_parking_rules_public_idx
  on public.community_parking_rules (city, published_at)
  where published_at is not null;
create unique index if not exists community_parking_rules_source_idx
  on public.community_parking_rules (source_submission_id);

alter table public.community_parking_rules enable row level security;
grant select on public.community_parking_rules to anon,authenticated;
drop policy if exists "approved community rules public read" on public.community_parking_rules;
create policy "approved community rules public read" on public.community_parking_rules
  for select to anon,authenticated using (published_at is not null);

-- Only a signed-in moderator can turn evidence into a public rule. The original
-- capture stays private; a redacted copy in sign-reviewed is the public source.
create table if not exists public.sign_moderators (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.sign_moderators enable row level security;
grant select on public.sign_moderators to authenticated;
drop policy if exists "moderators see own membership" on public.sign_moderators;
create policy "moderators see own membership" on public.sign_moderators for select to authenticated
  using (user_id=auth.uid());

drop policy if exists "moderators read sign submissions" on public.sign_submissions;
create policy "moderators read sign submissions" on public.sign_submissions for select to authenticated
  using (exists(select 1 from public.sign_moderators where user_id=auth.uid()));
drop policy if exists "moderators read private sign evidence" on storage.objects;
create policy "moderators read private sign evidence" on storage.objects for select to authenticated
  using (bucket_id='sign-evidence' and exists(select 1 from public.sign_moderators where user_id=auth.uid()));

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('sign-reviewed','sign-reviewed',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true,file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "moderators upload reviewed sign evidence" on storage.objects;
create policy "moderators upload reviewed sign evidence" on storage.objects for insert to authenticated
  with check (bucket_id='sign-reviewed' and exists(select 1 from public.sign_moderators where user_id=auth.uid()));

create or replace function public.valid_community_schedule(value jsonb)
returns boolean language plpgsql immutable as $$
declare item jsonb; day_value jsonb; start_min integer; end_min integer;
begin
  if jsonb_typeof(value) is distinct from 'object' or jsonb_typeof(value->'windows') is distinct from 'array'
     or jsonb_array_length(value->'windows') not between 1 and 42 then return false; end if;
  for item in select * from jsonb_array_elements(value->'windows') loop
    if jsonb_typeof(item->'days') is distinct from 'array' or jsonb_array_length(item->'days')=0
       or jsonb_typeof(item->'from') is distinct from 'number' or jsonb_typeof(item->'to') is distinct from 'number'
       or (item->>'from') !~ '^[0-9]{1,4}$' or (item->>'to') !~ '^[0-9]{1,4}$'
       or item->>'kind' is null or item->>'kind' not in ('free','paid','permit','ev') then return false; end if;
    start_min := (item->>'from')::integer; end_min := (item->>'to')::integer;
    if start_min < 0 or end_min > 1440 or start_min >= end_min then return false; end if;
    if item->>'kind'='paid' then
      if jsonb_typeof(item->'rate') is distinct from 'number' or (item->>'rate')::numeric <= 0
         or (item->>'rate')::numeric > 100 then return false; end if;
    elsif item ? 'rate' and item->'rate' <> 'null'::jsonb then return false; end if;
    if item ? 'limitMin' and item->'limitMin' <> 'null'::jsonb then
      if (item->>'limitMin') !~ '^[0-9]{1,4}$' or (item->>'limitMin')::integer not between 1 and 1440 then return false; end if;
    end if;
    for day_value in select * from jsonb_array_elements(item->'days') loop
      if jsonb_typeof(day_value) is distinct from 'number' or day_value::text !~ '^[0-6]$' then return false; end if;
    end loop;
  end loop;
  -- Reject overlapping windows on any shared day, including duplicate entries.
  if exists(select 1 from jsonb_array_elements(value->'windows') with ordinality a(win,idx)
    join jsonb_array_elements(value->'windows') with ordinality b(win,idx) on a.idx < b.idx
    where exists(select 1 from jsonb_array_elements(a.win->'days') ad(value)
      where b.win->'days' @> jsonb_build_array(ad.value))
      and (a.win->>'from')::integer < (b.win->>'to')::integer
      and (b.win->>'from')::integer < (a.win->>'to')::integer) then return false; end if;
  return true;
exception when others then return false;
end;
$$;

alter table public.community_parking_rules drop constraint if exists community_rules_schedule_valid;
alter table public.community_parking_rules drop constraint if exists community_rules_street_nonempty;
alter table public.community_parking_rules drop constraint if exists community_rules_side_valid;
alter table public.community_parking_rules drop constraint if exists community_rules_approved_source;
alter table public.community_parking_rules drop constraint if exists community_rules_public_evidence;

alter table public.community_parking_rules
  add constraint community_rules_schedule_valid check (public.valid_community_schedule(schedule));
alter table public.community_parking_rules
  add constraint community_rules_street_nonempty check (length(trim(street)) between 1 and 160);
alter table public.community_parking_rules
  add constraint community_rules_side_valid check (side in ('north','south','east','west'));
alter table public.community_parking_rules alter column side set not null;
alter table public.community_parking_rules
  add constraint community_rules_approved_source check (source_submission_id is not null);
alter table public.community_parking_rules
  add constraint community_rules_public_evidence check (evidence_url like
    'https://atgkbgekwluimgcrvbxr.supabase.co/storage/v1/object/public/sign-reviewed/%');
alter table public.community_parking_rules alter column evidence_url set not null;

create or replace function public.review_sign_submission(
  p_submission_id uuid,p_decision text,p_lat double precision default null,p_lon double precision default null,
  p_street text default null,p_side text default null,
  p_schedule jsonb default null,p_evidence_url text default null,p_note text default null)
returns uuid language plpgsql security definer set search_path=public,storage as $$
declare submission public.sign_submissions%rowtype; rule_id uuid; evidence_path text;
  reviewed_lat double precision; reviewed_lon double precision; offset_m double precision;
begin
  if auth.uid() is null or not exists(select 1 from public.sign_moderators where user_id=auth.uid())
    then raise exception 'moderator access required'; end if;
  if p_decision not in ('approved','rejected','needs_review') then raise exception 'invalid decision'; end if;
  select * into submission from public.sign_submissions where id=p_submission_id for update;
  if not found then raise exception 'submission not found'; end if;
  if submission.status='approved' then raise exception 'already approved'; end if;
  if p_decision='approved' then
    if submission.accuracy_m is null or submission.accuracy_m>50 then raise exception 'capture location is too uncertain'; end if;
    if (p_lat is null) <> (p_lon is null) then raise exception 'provide both final coordinates'; end if;
    reviewed_lat:=coalesce(p_lat,submission.inferred_lat,submission.lat);
    reviewed_lon:=coalesce(p_lon,submission.inferred_lon,submission.lon);
    if reviewed_lat not between -90 and 90 or reviewed_lon not between -180 and 180
      then raise exception 'invalid final coordinates'; end if;
    offset_m:=sqrt(power((reviewed_lat-submission.lat)*111320,2)+
      power((reviewed_lon-submission.lon)*111320*cos(radians(submission.lat)),2));
    if offset_m>60 then raise exception 'final pin is too far from the capture'; end if;
    if p_street is null or p_side not in ('north','south','east','west')
       or not public.valid_community_schedule(p_schedule) then raise exception 'verified street, side and schedule required'; end if;
    if p_evidence_url is null or p_evidence_url not like
      'https://atgkbgekwluimgcrvbxr.supabase.co/storage/v1/object/public/sign-reviewed/%'
      then raise exception 'redacted public evidence required'; end if;
    evidence_path := split_part(p_evidence_url,'/sign-reviewed/',2);
    if not exists(select 1 from storage.objects where bucket_id='sign-reviewed' and name=evidence_path)
      then raise exception 'reviewed evidence file not found'; end if;
    insert into public.community_parking_rules
      (city,lat,lon,street,side,schedule,source_submission_id,evidence_url,last_checked_at,published_at)
    values (submission.city,reviewed_lat,reviewed_lon,trim(p_street),p_side,p_schedule,
      submission.id,p_evidence_url,now(),now()) returning id into rule_id;
  end if;
  update public.sign_submissions set status=p_decision,reviewer_note=left(p_note,1000),reviewed_at=now()
    where id=p_submission_id;
  return rule_id;
end;
$$;
revoke all on function public.review_sign_submission(uuid,text,double precision,double precision,text,text,jsonb,text,text) from public,anon;
grant execute on function public.review_sign_submission(uuid,text,double precision,double precision,text,text,jsonb,text,text) to authenticated;
