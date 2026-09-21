create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9_]{3,30}$'),
  email text not null check (length(email) <= 320 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_username_unique on public.profiles(lower(username));
create unique index profiles_email_unique on public.profiles(lower(email));

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 120),
  details text not null default '' check (length(details) <= 2000),
  start_date date not null check (start_date between date '1900-01-01' and date '9999-12-31'),
  time_of_day time(0) not null check (time_of_day < time '24:00'),
  timezone text not null,
  recurrence_interval integer not null check (recurrence_interval between 1 and 1000),
  recurrence_unit text not null check (recurrence_unit in ('day', 'week', 'month', 'year')),
  recurrence_end_type text not null default 'never' check (recurrence_end_type in ('never', 'date')),
  recurrence_end_date date,
  snooze_duration_minutes integer not null default 10 check (snooze_duration_minutes between 1 and 10080),
  status text not null default 'active' check (status in ('active', 'paused')),
  next_occurrence_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_end check ((recurrence_end_type = 'never' and recurrence_end_date is null) or
    (recurrence_end_type = 'date' and recurrence_end_date is not null and recurrence_end_date >= start_date and recurrence_end_date <= date '9999-12-31'))
);
create index reminders_user on public.reminders(user_id);
create index reminders_due on public.reminders(next_occurrence_at) where status = 'active' and next_occurrence_at is not null;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (length(endpoint) <= 2048 and endpoint like 'https://%'),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{87}=?$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{22}={0,2}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index push_subscriptions_user on public.push_subscriptions(user_id);

-- Only transient delivery/action state. No completion history or analytics.
create table public.notification_occurrences (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null references public.reminders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  scheduled_at timestamptz not null,
  due_at timestamptz not null,
  generation integer not null default 0,
  state text not null default 'notified' check (state in ('notified', 'snoozed', 'done', 'cancelled')),
  action_token text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  created_at timestamptz not null default now(),
  unique (reminder_id, scheduled_at)
);
create index occurrences_snoozed_due on public.notification_occurrences(due_at) where state = 'snoozed';
create table public.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references public.notification_occurrences(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  generation integer not null,
  state text not null default 'pending' check (state in ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lease_until timestamptz,
  lease_token uuid,
  last_error text,
  unique(occurrence_id, subscription_id, generation)
);
create index deliveries_due on public.push_deliveries(available_at) where state in ('pending', 'sending');

alter table public.profiles enable row level security;
alter table public.reminders enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_occurrences enable row level security;
alter table public.push_deliveries enable row level security;

revoke all on public.profiles, public.reminders, public.push_subscriptions, public.notification_occurrences, public.push_deliveries from anon, authenticated;
grant select on public.profiles to authenticated;
grant update(username) on public.profiles to authenticated;
grant select, delete on public.reminders to authenticated;
grant insert(user_id, title, details, start_date, time_of_day, timezone, recurrence_interval, recurrence_unit, recurrence_end_type, recurrence_end_date, snooze_duration_minutes) on public.reminders to authenticated;
grant update(title, details, start_date, time_of_day, timezone, recurrence_interval, recurrence_unit, recurrence_end_type, recurrence_end_date, snooze_duration_minutes, status) on public.reminders to authenticated;
grant select, delete on public.push_subscriptions to authenticated;
grant all on public.profiles, public.reminders, public.push_subscriptions, public.notification_occurrences, public.push_deliveries to service_role;

create policy own_profile_select on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy own_profile_update on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy own_reminders_select on public.reminders for select to authenticated using (user_id = (select auth.uid()));
create policy own_reminders_insert on public.reminders for insert to authenticated with check (user_id = (select auth.uid()));
create policy own_reminders_update on public.reminders for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_reminders_delete on public.reminders for delete to authenticated using (user_id = (select auth.uid()));
create policy own_subscriptions_select on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy own_subscriptions_delete on public.push_subscriptions for delete to authenticated using (user_id = (select auth.uid()));
-- No client policies/grants for action tokens or outbox state.

create function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;
create trigger touch_profiles before update on public.profiles for each row execute function public.touch_updated_at();
create trigger touch_subscriptions before update on public.push_subscriptions for each row execute function public.touch_updated_at();

create function public.sync_auth_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.profiles(id, username, email) values(new.id, btrim(new.raw_user_meta_data ->> 'username'), new.email);
  elsif new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;
create trigger auth_profile_created after insert on auth.users for each row execute function public.sync_auth_profile();
create trigger auth_profile_email after update of email on auth.users for each row execute function public.sync_auth_profile();

create function public.username_available(p_username text) returns boolean language sql security definer set search_path = '' stable as $$
  select p_username ~ '^[A-Za-z0-9_]{3,30}$' and not exists(select 1 from public.profiles where lower(username) = lower(p_username));
$$;
revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

create function public.calculate_next_occurrence(r public.reminders, p_after timestamptz) returns timestamptz
language plpgsql stable set search_path = '' as $$
declare
  local_date date := (p_after at time zone r.timezone)::date;
  distance integer;
  occurrence_index integer;
  candidate_date date;
  candidate timestamptz;
begin
  if r.status = 'paused' then return null; end if;
  distance := case r.recurrence_unit
    when 'day' then local_date - r.start_date
    when 'week' then floor((local_date - r.start_date)::numeric / 7)::integer
    when 'month' then (extract(year from local_date)::integer - extract(year from r.start_date)::integer) * 12
      + extract(month from local_date)::integer - extract(month from r.start_date)::integer
    when 'year' then extract(year from local_date)::integer - extract(year from r.start_date)::integer end;
  occurrence_index := greatest(0, floor(distance::numeric / r.recurrence_interval)::integer - 1);
  loop
    candidate_date := case r.recurrence_unit
      when 'day' then r.start_date + occurrence_index * r.recurrence_interval
      when 'week' then r.start_date + occurrence_index * r.recurrence_interval * 7
      when 'month' then (r.start_date + make_interval(months => occurrence_index * r.recurrence_interval))::date
      when 'year' then (r.start_date + make_interval(years => occurrence_index * r.recurrence_interval))::date end;
    if candidate_date > date '9999-12-31' then return null; end if;
    if r.recurrence_end_type = 'date' and candidate_date > r.recurrence_end_date then return null; end if;
    candidate := (candidate_date + r.time_of_day) at time zone r.timezone;
    if candidate > p_after then return candidate; end if;
    occurrence_index := occurrence_index + 1;
  end loop;
end;
$$;

create function public.prepare_reminder() returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists(select 1 from pg_catalog.pg_timezone_names where name = new.timezone) or
      (new.timezone <> 'UTC' and position('/' in new.timezone) = 0) then
    raise exception 'Invalid IANA time zone' using errcode = '22023';
  end if;
  new.title := btrim(new.title);
  new.updated_at := now();
  if TG_OP = 'INSERT' then
    new.next_occurrence_at := public.calculate_next_occurrence(new, now());
  elsif row(new.start_date, new.time_of_day, new.timezone, new.recurrence_interval, new.recurrence_unit,
    new.recurrence_end_type, new.recurrence_end_date, new.status) is distinct from
    row(old.start_date, old.time_of_day, old.timezone, old.recurrence_interval, old.recurrence_unit,
    old.recurrence_end_type, old.recurrence_end_date, old.status) then
    new.next_occurrence_at := public.calculate_next_occurrence(new, now());
  end if;
  return new;
end;
$$;
create trigger prepare_reminder before insert or update on public.reminders for each row execute function public.prepare_reminder();

create function public.cancel_changed_occurrences() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if row(new.start_date, new.time_of_day, new.timezone, new.recurrence_interval, new.recurrence_unit,
    new.recurrence_end_type, new.recurrence_end_date, new.status) is distinct from
    row(old.start_date, old.time_of_day, old.timezone, old.recurrence_interval, old.recurrence_unit,
    old.recurrence_end_type, old.recurrence_end_date, old.status) then
    update public.notification_occurrences set state = 'cancelled' where reminder_id = new.id and state in ('notified','snoozed');
    update public.push_deliveries d set state = 'cancelled' from public.notification_occurrences o
      where d.occurrence_id = o.id and o.reminder_id = new.id and d.state in ('pending','sending');
  end if;
  return new;
end;
$$;
create trigger cancel_changed_occurrences after update on public.reminders for each row execute function public.cancel_changed_occurrences();

create function public.register_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = '' as $$
declare current_user_id uuid := auth.uid(); existing public.push_subscriptions;
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  -- An endpoint plus its encryption keys is a capability for this installation.
  select * into existing from public.push_subscriptions where endpoint = p_endpoint for update;
  if existing.id is not null and (existing.p256dh <> p_p256dh or existing.auth <> p_auth) then
    raise exception 'Subscription keys do not match' using errcode = '42501';
  end if;
  if existing.id is not null and existing.user_id <> current_user_id then
    delete from public.push_deliveries where subscription_id = existing.id;
  end if;
  insert into public.push_subscriptions(user_id, endpoint, p256dh, auth) values(current_user_id, p_endpoint, p_p256dh, p_auth)
  on conflict(endpoint) do update set user_id = excluded.user_id, updated_at = now()
    where public.push_subscriptions.p256dh = excluded.p256dh and public.push_subscriptions.auth = excluded.auth;
  if not found then raise exception 'Subscription keys do not match' using errcode = '42501'; end if;
end;
$$;
revoke all on function public.register_push_subscription(text,text,text) from public;
grant execute on function public.register_push_subscription(text,text,text) to authenticated;

create function public.enqueue_due_notifications(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path = '' as $$
declare r public.reminders; o public.notification_occurrences; occurrence_id uuid; count_enqueued integer := 0;
begin
  for r in select * from public.reminders where status = 'active' and next_occurrence_at <= p_now
    order by next_occurrence_at limit 100 for update skip locked loop
    insert into public.notification_occurrences(reminder_id,user_id,scheduled_at,due_at)
      values(r.id,r.user_id,r.next_occurrence_at,p_now) on conflict(reminder_id,scheduled_at) do nothing returning id into occurrence_id;
    if occurrence_id is not null then
      insert into public.push_deliveries(occurrence_id,subscription_id,generation)
        select occurrence_id,id,0 from public.push_subscriptions where user_id = r.user_id on conflict do nothing;
      count_enqueued := count_enqueued + 1;
    end if;
    -- Advance from now: a late scheduler sends one nudge, never a backlog.
    update public.reminders set next_occurrence_at = public.calculate_next_occurrence(r,p_now) where id = r.id;
  end loop;
  for o in select n.* from public.notification_occurrences n join public.reminders reminder on reminder.id = n.reminder_id
    where n.state = 'snoozed' and n.due_at <= p_now and reminder.status = 'active'
    order by n.due_at limit 100 for update of n skip locked loop
    insert into public.push_deliveries(occurrence_id,subscription_id,generation)
      select o.id,id,o.generation from public.push_subscriptions where user_id = o.user_id on conflict do nothing;
    update public.notification_occurrences set state = 'notified' where id = o.id;
    count_enqueued := count_enqueued + 1;
  end loop;
  -- Expire action capabilities and transient delivery records after 8 days.
  delete from public.notification_occurrences where created_at < p_now - interval '8 days' and state <> 'snoozed';
  return count_enqueued;
end;
$$;

create function public.claim_push_deliveries(p_limit integer default 50) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  update public.push_deliveries set state = 'failed', lease_token = null, lease_until = null, last_error = 'lease_expired_after_max_attempts'
    where state = 'sending' and attempts >= 5 and lease_until < now();
  with candidates as (
    select d.id from public.push_deliveries d join public.notification_occurrences o on o.id = d.occurrence_id
      join public.reminders r on r.id = o.reminder_id join public.push_subscriptions s on s.id = d.subscription_id
    where ((d.state = 'pending' and d.available_at <= now()) or (d.state = 'sending' and d.lease_until < now()))
      and d.attempts < 5 and o.state = 'notified' and o.generation = d.generation and r.status = 'active' and s.user_id = o.user_id
    order by d.available_at limit least(greatest(p_limit,1),100) for update of d skip locked
  ), claimed as (
    update public.push_deliveries d set state = 'sending', attempts = attempts + 1,
      lease_until = now() + interval '2 minutes', lease_token = gen_random_uuid()
      from candidates c where d.id = c.id returning d.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'lease_token',c.lease_token,'subscription_id',s.id,'endpoint',s.endpoint,'p256dh',s.p256dh,'auth',s.auth,
    'occurrence_id',o.id,'generation',o.generation,'token',o.action_token,'reminder_id',r.id,'title',r.title,'details',r.details)), '[]'::jsonb)
  into result from claimed c join public.push_subscriptions s on s.id = c.subscription_id
    join public.notification_occurrences o on o.id = c.occurrence_id join public.reminders r on r.id = o.reminder_id;
  return result;
end;
$$;

create function public.finish_push_delivery(p_id uuid,p_lease_token uuid,p_outcome text,p_error text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_outcome not in ('sent','retry','failed') then raise exception 'Invalid outcome'; end if;
  update public.push_deliveries set
    state = case when p_outcome = 'retry' and attempts < 5 then 'pending' when p_outcome = 'retry' then 'failed' else p_outcome end,
    available_at = now() + make_interval(secs => least(3600, (power(2,attempts) * 30)::integer)),
    lease_until = null, lease_token = null, last_error = left(p_error,100)
  where id = p_id and lease_token = p_lease_token and state = 'sending';
end;
$$;

create function public.apply_notification_action(p_occurrence_id uuid,p_token text,p_generation integer,p_action text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare o public.notification_occurrences; r public.reminders;
begin
  if p_action not in ('done','snooze') then raise exception 'Invalid action' using errcode = '22023'; end if;
  -- Lock in reminder → occurrence → delivery order, matching scheduler/edit paths.
  select r0.* into r from public.reminders r0 join public.notification_occurrences o0 on o0.reminder_id = r0.id
    where o0.id = p_occurrence_id for update of r0;
  select * into o from public.notification_occurrences where id = p_occurrence_id for update;
  if o.id is null or o.action_token <> p_token or o.created_at < now() - interval '8 days' then return false; end if;
  if o.generation <> p_generation or o.state <> 'notified' or r.status <> 'active' then return true; end if;
  update public.push_deliveries set state = 'cancelled' where occurrence_id = o.id and state in ('pending','sending');
  if p_action = 'done' then
    update public.notification_occurrences set state = 'done' where id = o.id;
  else
    update public.notification_occurrences set state = 'snoozed', generation = generation + 1,
      due_at = now() + make_interval(mins => r.snooze_duration_minutes) where id = o.id;
  end if;
  -- Base next_occurrence_at was already advanced at dispatch, and is never snoozed.
  return true;
end;
$$;

revoke all on function public.touch_updated_at(), public.sync_auth_profile(), public.prepare_reminder(), public.cancel_changed_occurrences(),
  public.calculate_next_occurrence(public.reminders,timestamptz), public.enqueue_due_notifications(timestamptz),
  public.claim_push_deliveries(integer), public.finish_push_delivery(uuid,uuid,text,text),
  public.apply_notification_action(uuid,text,integer,text) from public, anon, authenticated;
grant execute on function public.calculate_next_occurrence(public.reminders,timestamptz) to authenticated, service_role;
grant execute on function public.enqueue_due_notifications(timestamptz), public.claim_push_deliveries(integer),
  public.finish_push_delivery(uuid,uuid,text,text), public.apply_notification_action(uuid,text,integer,text) to service_role;

alter publication supabase_realtime add table public.reminders;
