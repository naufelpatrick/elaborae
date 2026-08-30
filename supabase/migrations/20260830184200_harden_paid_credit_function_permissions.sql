-- Restrict privileged billing functions to server-side service role only.
-- The daily free-slot reservation remains callable by authenticated users
-- because it derives the user from auth.uid() and is invoked with the user's session.

revoke execute on function public.apply_stripe_credit_purchase(uuid,text,text,text,integer,integer,text) from anon, authenticated;
revoke execute on function public.consume_paid_credit(uuid) from anon, authenticated;
revoke execute on function public.complete_consultation_with_entitlement(uuid,text,integer) from anon, authenticated;

grant execute on function public.apply_stripe_credit_purchase(uuid,text,text,text,integer,integer,text) to service_role;
grant execute on function public.consume_paid_credit(uuid) to service_role;
grant execute on function public.complete_consultation_with_entitlement(uuid,text,integer) to service_role;

revoke execute on function public.reserve_daily_free_consultation_slot(text,integer) from anon;
grant execute on function public.reserve_daily_free_consultation_slot(text,integer) to authenticated;
