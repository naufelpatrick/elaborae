create or replace function public.complete_consultation_with_entitlement(
  p_user_id uuid,
  p_consultation_id text,
  p_free_limit integer default 3
)
returns table (
  inserted boolean,
  free_used integer,
  paid_balance integer,
  charged_paid boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
  v_balance integer := 0;
  v_charged boolean := false;
begin
  if p_free_limit < 1 then
    raise exception 'INVALID_FREE_LIMIT';
  end if;

  perform pg_advisory_xact_lock(hashtext('elaborae_entitlement_' || p_user_id::text));

  if exists (
    select 1
    from public.consultation_usage
    where user_id = p_user_id
      and consultation_id = p_consultation_id
  ) then
    select count(*)::integer
      into v_total
    from public.consultation_usage
    where user_id = p_user_id;

    select coalesce(balance, 0)
      into v_balance
    from public.user_credit_wallets
    where user_id = p_user_id;

    return query
      select false, least(v_total, p_free_limit), coalesce(v_balance, 0), false;
    return;
  end if;

  select count(*)::integer
    into v_total
  from public.consultation_usage
  where user_id = p_user_id;

  if v_total >= p_free_limit then
    update public.user_credit_wallets
    set balance = balance - 1,
        updated_at = now()
    where user_id = p_user_id
      and balance > 0
    returning balance into v_balance;

    if v_balance is null then
      raise exception 'NO_PAID_CREDITS';
    end if;

    v_charged := true;
  else
    select coalesce(balance, 0)
      into v_balance
    from public.user_credit_wallets
    where user_id = p_user_id;
  end if;

  insert into public.consultation_usage (user_id, consultation_id)
  values (p_user_id, p_consultation_id);

  v_total := v_total + 1;

  return query
    select true, least(v_total, p_free_limit), coalesce(v_balance, 0), v_charged;
end;
$$;

revoke all on function public.complete_consultation_with_entitlement(uuid,text,integer) from public;
grant execute on function public.complete_consultation_with_entitlement(uuid,text,integer) to service_role;
