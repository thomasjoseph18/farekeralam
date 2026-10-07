create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.refresh_fare_costs()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  api_base text;
  anon_key text;
  refresh_secret text;
  request_id bigint;
begin
  select decrypted_secret into api_base from vault.decrypted_secrets where name = 'fare_cost_api_base' limit 1;
  select decrypted_secret into anon_key from vault.decrypted_secrets where name = 'fare_cost_anon_key' limit 1;
  select decrypted_secret into refresh_secret from vault.decrypted_secrets where name = 'fare_cost_refresh_secret' limit 1;
  if api_base is null or anon_key is null or refresh_secret is null then
    raise exception 'Configure all three fare cost Vault secrets before running the updater';
  end if;
  select net.http_post(
    url := rtrim(api_base, '/') || '/costs/refresh',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || anon_key, 'apikey', anon_key, 'X-Refresh-Secret', refresh_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 65000
  ) into request_id;
  return request_id;
end;
$$;

revoke all on function public.refresh_fare_costs() from public, anon, authenticated;
grant execute on function public.refresh_fare_costs() to postgres;

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'fare-keralam-daily-costs';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
end;
$$;

select cron.schedule('fare-keralam-daily-costs', '30 0 * * *', 'select public.refresh_fare_costs();');
