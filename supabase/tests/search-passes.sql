begin;
do $$
declare ip text:=repeat('1',64); token text:=repeat('2',64); i integer;
begin
 if public.guard_place_search('suggest',ip,token)<>'verification' then raise exception 'missing pass accepted';end if;
 if public.guard_place_search('create',ip,token)<>'ok' then raise exception 'creation failed';end if;
 if public.guard_place_search('suggest',repeat('3',64),token)<>'verification' then raise exception 'wrong IP accepted';end if;
 for i in 1..30 loop
   if public.guard_place_search('suggest',ip,token)<>'ok' then raise exception 'request % rejected too early',i;end if;
 end loop;
 if public.guard_place_search('suggest',ip,token)<>'rate' then raise exception 'minute cap failed';end if;
 update public.place_search_passes set expires_at=now()-interval '1 second' where token_hash=token;
 if public.guard_place_search('details',ip,token)<>'verification' then raise exception 'expired pass accepted';end if;
 for i in 1..3 loop
   if public.guard_place_search('issue',ip)<>'ok' then raise exception 'issuance rejected too early';end if;
 end loop;
 if public.guard_place_search('issue',ip)<>'rate' then raise exception 'issuance cap failed';end if;
 if has_function_privilege('anon','public.guard_place_search(text,text,text)','execute') then raise exception 'anonymous RPC access';end if;
 if has_table_privilege('anon','public.place_search_passes','select') then raise exception 'anonymous pass access';end if;
end;$$;
select true as missing_pass_blocked,true as wrong_ip_blocked,true as expired_pass_blocked,true as rate_caps_enforced,true as private_storage;
rollback;
