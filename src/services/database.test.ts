import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { nextOccurrence } from '../lib/recurrence';
import type { Reminder } from '../types/models';

let db: PGlite;
const userA = '10000000-0000-4000-8000-000000000001';
const userB = '10000000-0000-4000-8000-000000000002';
const reminderA = '20000000-0000-4000-8000-000000000001';
const reminderB = '20000000-0000-4000-8000-000000000002';
async function asUser<T>(user: string, operation: () => Promise<T>) {
  await db.exec(
    `set role authenticated; select set_config('request.jwt.claim.sub','${user}',false);`,
  );
  try {
    return await operation();
  } finally {
    await db.exec('reset role;');
  }
}
beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create schema auth; create schema extensions;
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth, public, extensions to authenticated, anon, service_role;
    grant execute on function auth.uid() to authenticated, anon, service_role;
    create publication supabase_realtime;
  `);
  await db.exec(await readFile('supabase/migrations/202609160001_initial.sql', 'utf8'));
  await db.exec(`insert into auth.users values
    ('${userA}','alice@example.com','{"username":"alice"}'),('${userB}','bob@example.com','{"username":"bob"}');
    insert into public.reminders(id,user_id,title,start_date,time_of_day,timezone,recurrence_interval,recurrence_unit)
    values('${reminderA}','${userA}','Alice reminder','2026-01-01','09:00','UTC',1,'day'),
      ('${reminderB}','${userB}','Bob reminder','2026-01-01','09:00','UTC',1,'day');`);
});
afterAll(async () => {
  await db?.close();
});

describe('real PostgreSQL migration and ownership boundaries', () => {
  it('limits profile, reminder, and subscription reads to the owner', async () => {
    await asUser(userA, async () => {
      expect((await db.query('select username from profiles')).rows).toEqual([
        { username: 'alice' },
      ]);
      expect((await db.query('select title from reminders')).rows).toEqual([
        { title: 'Alice reminder' },
      ]);
      expect((await db.query('select * from push_subscriptions')).rows).toHaveLength(0);
    });
  });
  it('prevents cross-user writes, ownership changes, email edits, and scheduling overrides', async () => {
    await asUser(userA, async () => {
      expect(
        (
          await db.query("update reminders set title = 'hacked' where id = $1 returning id", [
            reminderB,
          ])
        ).rows,
      ).toHaveLength(0);
      expect(
        (await db.query('delete from reminders where id = $1 returning id', [reminderB])).rows,
      ).toHaveLength(0);
      await expect(
        db.query(
          "insert into reminders(user_id,title,start_date,time_of_day,timezone,recurrence_interval,recurrence_unit) values($1,'hacked','2026-01-01','09:00','UTC',1,'day')",
          [userB],
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        db.query('update reminders set user_id = $1 where id = $2', [userB, reminderA]),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        db.query("update profiles set email = 'hacked@example.com' where id = $1", [userA]),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        db.query('update reminders set next_occurrence_at = now() where id = $1', [reminderA]),
      ).rejects.toMatchObject({ code: '42501' });
    });
  });
  it('denies access to action tokens and privileged scheduler RPCs', async () => {
    await asUser(userA, async () => {
      await expect(db.query('select * from notification_occurrences')).rejects.toMatchObject({
        code: '42501',
      });
      await expect(db.query('select enqueue_due_notifications()')).rejects.toMatchObject({
        code: '42501',
      });
      await expect(db.query('select claim_push_deliveries()')).rejects.toMatchObject({
        code: '42501',
      });
    });
    await db.exec('set role anon;');
    try {
      await expect(db.query('select * from reminders')).rejects.toMatchObject({ code: '42501' });
    } finally {
      await db.exec('reset role;');
    }
  });
  it('enforces case-insensitive unique usernames and synchronizes confirmed auth email', async () => {
    await asUser(userA, async () => {
      await expect(
        db.query("update profiles set username = 'BOB' where id = $1", [userA]),
      ).rejects.toMatchObject({ code: '23505' });
    });
    await db.query("update auth.users set email = 'new-alice@example.com' where id = $1", [userA]);
    expect((await db.query('select email from profiles where id = $1', [userA])).rows).toEqual([
      { email: 'new-alice@example.com' },
    ]);
  });
  it('validates inputs at the database boundary', async () => {
    await asUser(userA, async () => {
      for (const query of [
        "update reminders set title = ' ' where id = $1",
        'update reminders set snooze_duration_minutes = 0 where id = $1',
        'update reminders set recurrence_interval = 0 where id = $1',
        "update reminders set timezone = 'Bogus/Zone' where id = $1",
        "update reminders set recurrence_end_type = 'date', recurrence_end_date = '2025-01-01' where id = $1",
      ])
        await expect(db.query(query, [reminderA])).rejects.toBeDefined();
    });
  });
  it('allows own CRUD and calculates schedules authoritatively', async () => {
    await asUser(userA, async () => {
      const result = await db.query<Reminder>(
        "update reminders set time_of_day = '10:00', status = 'active' where id = $1 returning *",
        [reminderA],
      );
      expect(result.rows[0].next_occurrence_at).toBeTruthy();
      await db.query("update reminders set status = 'paused' where id = $1", [reminderA]);
      expect(
        (await db.query('select next_occurrence_at from reminders where id = $1', [reminderA]))
          .rows,
      ).toEqual([{ next_occurrence_at: null }]);
      await db.query("update reminders set status = 'active' where id = $1", [reminderA]);
      expect(
        (
          await db.query<{ future: boolean }>(
            'select next_occurrence_at > now() as future from reminders where id = $1',
            [reminderA],
          )
        ).rows[0].future,
      ).toBe(true);
    });
  });
  it('registers multiple devices without exposing other users’ subscriptions', async () => {
    await asUser(userA, async () => {
      await db.query('select register_push_subscription($1,$2,$3)', [
        'https://fcm.googleapis.com/fcm/send/device-a',
        'a'.repeat(87),
        'b'.repeat(22),
      ]);
      await db.query('select register_push_subscription($1,$2,$3)', [
        'https://fcm.googleapis.com/fcm/send/device-a2',
        'a'.repeat(87),
        'b'.repeat(22),
      ]);
      expect((await db.query('select * from push_subscriptions')).rows).toHaveLength(2);
    });
    await asUser(userB, async () => {
      expect((await db.query('select * from push_subscriptions')).rows).toHaveLength(0);
      await expect(
        db.query('select register_push_subscription($1,$2,$3)', [
          'https://fcm.googleapis.com/fcm/send/device-a',
          'c'.repeat(87),
          'd'.repeat(22),
        ]),
      ).rejects.toMatchObject({ code: '42501' });
    });
  });
});

describe('SQL / client calendar parity', () => {
  it('matches DST, month boundaries, leap years and recurrence end semantics', async () => {
    const examples = [
      {
        start_date: '2026-01-31',
        recurrence_unit: 'month',
        time_of_day: '09:00',
        timezone: 'UTC',
        after: '2026-02-28T09:00:00Z',
      },
      {
        start_date: '2024-02-29',
        recurrence_unit: 'year',
        time_of_day: '09:00',
        timezone: 'UTC',
        after: '2027-03-01T00:00:00Z',
      },
      {
        start_date: '2026-01-01',
        recurrence_unit: 'day',
        time_of_day: '02:30',
        timezone: 'America/New_York',
        after: '2026-03-08T05:00:00Z',
      },
      {
        start_date: '2026-01-01',
        recurrence_unit: 'day',
        time_of_day: '01:30',
        timezone: 'America/New_York',
        after: '2026-11-01T04:00:00Z',
      },
      {
        start_date: '2026-01-01',
        recurrence_unit: 'day',
        time_of_day: '09:00',
        timezone: 'Europe/Kyiv',
        after: '2026-03-28T12:00:00Z',
      },
    ];
    for (const example of examples) {
      const { after, ...fields } = example;
      const { rows } = await db.query<{ next: Date; schedule: Reminder }>(
        `with r as (select jsonb_populate_record(null::public.reminders,$1::jsonb) as schedule)
        select calculate_next_occurrence(schedule,$2::timestamptz) as next, to_jsonb(schedule) as schedule from r`,
        [
          JSON.stringify({
            ...fields,
            recurrence_interval: 1,
            recurrence_end_type: 'never',
            status: 'active',
          }),
          after,
        ],
      );
      expect(new Date(rows[0].next).toISOString()).toBe(
        new Date(nextOccurrence(rows[0].schedule, new Date(after))!).toISOString(),
      );
    }
  });
});

describe('outbox and notification actions', () => {
  let occurrence: { id: string; action_token: string };
  let baseNext: string;
  it('enqueues each occurrence once, advances without backfilling and leases each device separately', async () => {
    await db.query("update reminders set status = 'paused' where id = $1", [reminderB]);
    await db.query(
      "update reminders set next_occurrence_at = now() - interval '5 days' where id = $1",
      [reminderA],
    );
    await db.query('select enqueue_due_notifications()');
    await db.query('select enqueue_due_notifications()');
    const result = await db.query<{ id: string; action_token: string }>(
      'select id,action_token from notification_occurrences where reminder_id = $1',
      [reminderA],
    );
    expect(result.rows).toHaveLength(1);
    occurrence = result.rows[0];
    expect((await db.query('select * from push_deliveries')).rows).toHaveLength(2);
    const next = (
      await db.query<{ next: Date }>(
        'select next_occurrence_at as next from reminders where id = $1',
        [reminderA],
      )
    ).rows[0].next;
    baseNext = new Date(next).toISOString();
    expect(new Date(next).getTime()).toBeGreaterThan(Date.now());
    const claimed = (
      await db.query<{ jobs: { id: string; lease_token: string }[] }>(
        'select claim_push_deliveries() as jobs',
      )
    ).rows[0].jobs;
    expect(claimed).toHaveLength(2);
    expect(
      (await db.query<{ jobs: unknown[] }>('select claim_push_deliveries() as jobs')).rows[0].jobs,
    ).toHaveLength(0);
    for (const job of claimed)
      await db.query("select finish_push_delivery($1,$2,'sent',null)", [job.id, job.lease_token]);
  });
  it('snoozes idempotently without changing the base next occurrence', async () => {
    const args = [occurrence.id, occurrence.action_token, 0, 'snooze'];
    expect(
      (await db.query<{ ok: boolean }>('select apply_notification_action($1,$2,$3,$4) as ok', args))
        .rows[0].ok,
    ).toBe(true);
    await db.query('select apply_notification_action($1,$2,$3,$4)', args);
    const row = (
      await db.query<{ generation: number; state: string; minutes: number }>(
        'select generation,state,extract(epoch from due_at-now())/60 as minutes from notification_occurrences where id = $1',
        [occurrence.id],
      )
    ).rows[0];
    expect(row.generation).toBe(1);
    expect(row.state).toBe('snoozed');
    expect(Number(row.minutes)).toBeCloseTo(10, 0);
    expect(
      new Date(
        (
          await db.query<{ next: Date }>(
            'select next_occurrence_at as next from reminders where id = $1',
            [reminderA],
          )
        ).rows[0].next,
      ).toISOString(),
    ).toBe(baseNext);
  });
  it('dispatches the snoozed generation and Done only acknowledges that occurrence', async () => {
    await db.query(
      "update notification_occurrences set due_at = now() - interval '1 minute' where id = $1",
      [occurrence.id],
    );
    await db.query('select enqueue_due_notifications()');
    expect(
      (await db.query('select * from push_deliveries where generation = 1')).rows,
    ).toHaveLength(2);
    await db.query("select apply_notification_action($1,$2,1,'done')", [
      occurrence.id,
      occurrence.action_token,
    ]);
    await db.query("select apply_notification_action($1,$2,1,'snooze')", [
      occurrence.id,
      occurrence.action_token,
    ]);
    expect(
      (await db.query('select state from notification_occurrences where id = $1', [occurrence.id]))
        .rows,
    ).toEqual([{ state: 'done' }]);
    expect(
      (await db.query('select status from reminders where id = $1', [reminderA])).rows,
    ).toEqual([{ status: 'active' }]);
    expect(
      new Date(
        (
          await db.query<{ next: Date }>(
            'select next_occurrence_at as next from reminders where id = $1',
            [reminderA],
          )
        ).rows[0].next,
      ).toISOString(),
    ).toBe(baseNext);
  });
  it('rejects invalid tokens and cancels queued work on pause and delete', async () => {
    expect(
      (
        await db.query<{ ok: boolean }>("select apply_notification_action($1,$2,1,'done') as ok", [
          occurrence.id,
          '0'.repeat(64),
        ])
      ).rows[0].ok,
    ).toBe(false);
    await db.query(
      "update reminders set next_occurrence_at = now() - interval '1 minute' where id = $1",
      [reminderA],
    );
    await db.query('select enqueue_due_notifications()');
    await asUser(userA, async () => {
      await db.query("update reminders set status = 'paused' where id = $1", [reminderA]);
    });
    expect(
      (await db.query<{ jobs: unknown[] }>('select claim_push_deliveries() as jobs')).rows[0].jobs,
    ).toHaveLength(0);
    await asUser(userA, async () => {
      await db.query('delete from reminders where id = $1', [reminderA]);
    });
    expect((await db.query('select * from notification_occurrences')).rows).toHaveLength(0);
    expect((await db.query('select * from push_deliveries')).rows).toHaveLength(0);
  });
});
