-- Public search with server-enforced IP and monthly limits; no browser challenge.
create or replace function public.guard_place_search(action_name text, ip_digest text, pass_digest text default '')
returns text language plpgsql security definer set search_path='' as $$
declare now_at timestamptz:=clock_timestamp();
begin
  if ip_digest is null or ip_digest !~ '^[a-f0-9]{64}$' then return 'invalid'; end if;
  if action_name is null or action_name not in ('suggest','details') then return 'invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('search-ip:'||ip_digest,0));
  delete from public.place_search_limits where bucket < now_at-interval '2 days';
  if not public.search_take_limit('search-minute:'||ip_digest,date_trunc('minute',now_at),30)
    or not public.search_take_limit('search-day:'||ip_digest,date_trunc('day',now_at at time zone 'UTC') at time zone 'UTC',250)
  then return 'rate'; end if;
  if not public.reserve_place_search(action_name) then return 'budget'; end if;
  return 'ok';
end; $$;
revoke all on function public.guard_place_search(text,text,text) from public,anon,authenticated;
grant execute on function public.guard_place_search(text,text,text) to service_role;
