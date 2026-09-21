-- Run after deploying the Edge Functions and creating the Vault secrets described in README.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$ begin
  if exists(select 1 from cron.job where jobname = 'dispatch-reminders') then
    perform cron.unschedule('dispatch-reminders');
  end if;
end $$;

select cron.schedule('dispatch-reminders', '* * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'reminder_project_url') || '/functions/v1/dispatch-reminders',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets where name = 'reminder_anon_key'), 'apikey',
      (select decrypted_secret from vault.decrypted_secrets where name = 'reminder_anon_key'), 'x-scheduler-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'reminder_scheduler_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
$$);
