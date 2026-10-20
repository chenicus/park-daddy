-- Separate, aggregate counters: no search queries, places, IPs or user identifiers.
create table if not exists public.place_search_budget (
  period date not null,
  operation text not null check (operation in ('suggest','details')),
  used integer not null default 0,
  primary key (period, operation)
);
alter table public.place_search_budget enable row level security;
revoke all on public.place_search_budget from anon, authenticated;

create or replace function public.reserve_place_search(operation_name text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  cap integer;
  reserved integer;
  month_start date := date_trunc('month', now() at time zone 'UTC')::date;
begin
  -- Leave headroom below TomTom's current free monthly allowance.
  cap := case operation_name when 'suggest' then 9000 when 'details' then 4500 else 0 end;
  if cap = 0 then return false; end if;
  insert into public.place_search_budget as b(period, operation, used)
    values (month_start, operation_name, 1)
    on conflict (period, operation) do update set used = b.used + 1
    where b.used < cap
    returning used into reserved;
  return reserved is not null;
end;
$$;
revoke all on function public.reserve_place_search(text) from public, anon, authenticated;
grant execute on function public.reserve_place_search(text) to service_role;
