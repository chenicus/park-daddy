-- No raw IP addresses, queries, or plaintext search passes are stored.
create table if not exists public.place_search_limits (
  scope text not null, bucket timestamptz not null, used integer not null,
  primary key(scope,bucket)
);
create table if not exists public.place_search_passes (
  token_hash text primary key, ip_hash text not null,
  expires_at timestamptz not null, used integer not null default 0
);
create index if not exists place_search_limits_expiry on public.place_search_limits(bucket);
create index if not exists place_search_passes_expiry on public.place_search_passes(expires_at);
alter table public.place_search_limits enable row level security;
alter table public.place_search_passes enable row level security;
revoke all on public.place_search_limits,public.place_search_passes from anon,authenticated;

create or replace function public.search_take_limit(scope_name text, window_start timestamptz, maximum integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare amount integer;
begin
  insert into public.place_search_limits as l values(scope_name,window_start,1)
    on conflict(scope,bucket) do update set used=l.used+1 where l.used<maximum
    returning used into amount;
  return amount is not null;
end; $$;
revoke all on function public.search_take_limit(text,timestamptz,integer) from public,anon,authenticated;

create or replace function public.guard_place_search(action_name text, ip_digest text, pass_digest text default '')
returns text language plpgsql security definer set search_path='' as $$
declare p public.place_search_passes; now_at timestamptz:=clock_timestamp();
begin
  if ip_digest !~ '^[a-f0-9]{64}$' then return 'invalid'; end if;
  -- Same-IP calls lock in one order. Reservations commit before provider calls.
  perform pg_advisory_xact_lock(hashtextextended('search-ip:'||ip_digest,0));
  delete from public.place_search_limits where bucket < now_at-interval '2 days';
  delete from public.place_search_passes where expires_at < now_at;
  if action_name='issue' then
    if not public.search_take_limit('issue-minute:'||ip_digest,date_trunc('minute',now_at),3)
      or not public.search_take_limit('issue-day:'||ip_digest,date_trunc('day',now_at at time zone 'UTC') at time zone 'UTC',20)
    then return 'rate'; end if;
    return 'ok';
  end if;
  if pass_digest !~ '^[a-f0-9]{64}$' then return 'verification'; end if;
  if action_name='create' then
    insert into public.place_search_passes values(pass_digest,ip_digest,now_at+interval '10 minutes',0);
    return 'ok';
  end if;
  if action_name not in ('suggest','details') then return 'invalid'; end if;
  select * into p from public.place_search_passes where token_hash=pass_digest for update;
  if not found or p.expires_at<=now_at or p.ip_hash<>ip_digest then return 'verification'; end if;
  if p.used>=100 then return 'rate'; end if;
  if not public.search_take_limit('search-minute:'||ip_digest,date_trunc('minute',now_at),30)
    or not public.search_take_limit('search-day:'||ip_digest,date_trunc('day',now_at at time zone 'UTC') at time zone 'UTC',250)
  then return 'rate'; end if;
  if not public.reserve_place_search(action_name) then return 'budget'; end if;
  update public.place_search_passes set used=used+1 where token_hash=pass_digest;
  return 'ok';
end; $$;
revoke all on function public.guard_place_search(text,text,text) from public,anon,authenticated;
grant execute on function public.guard_place_search(text,text,text) to service_role;
