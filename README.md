# Reminder

A focused, mobile-first PWA for recurring reminders. Built from the V1 specification in [docs/SPECIFICATION.md](docs/SPECIFICATION.md).

React, strict TypeScript, Vite, React Router, Redux Toolkit, Tailwind CSS, Supabase Auth/PostgreSQL/Realtime/Edge Functions, and native Web Push. No traditional backend. Reminder records live in Supabase; browser storage is used by Supabase for authentication, not as a reminder database.

## Getting started

Requires Node.js 22.12+ or 24+ and npm. Tested locally with Node 24.21.

```powershell
npm ci
Copy-Item .env.example .env
# Fill .env with your Supabase URL, public key, and public VAPID key.
npm run dev
```

Open http://localhost:5173. Without configuration, the auth page explains the setup and disables submission. There are no fake accounts or sample reminders in the database.

### Local Supabase

Install Docker Desktop and the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started). Neither is bundled with this application.

```powershell
npx supabase start
npx supabase db reset
npx supabase status
```

Copy the local API URL and publishable/anon key into `.env`. `db reset` applies the migration and **resets your local database**; use it only for disposable development data. For an existing database, use `npx supabase migration up` instead. Local confirmation/reset emails can be viewed in the mail UI at http://localhost:54324.

### Hosted Supabase

Create a Supabase project, then:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Configure the Auth site URL and redirect allowlist for your actual origin:

- `/auth` for signup confirmation.
- `/auth?recovery=1` for password recovery.
- `/profile` for confirmed email changes.

The app uses PKCE. Open confirmation/recovery links in the browser that initiated the request. Keep email confirmations and secure email change enabled; configure your production SMTP provider, rate limits, minimum password length 12, and uppercase/lowercase/digit requirements to match `supabase/config.toml`. Passwords are managed exclusively by Supabase Auth. Use Supabase's secure password change/reauthentication setting as appropriate for your deployment; a rejected password update is shown as a recoverable error and users can use the reset flow.

Usernames are case-insensitively unique, enforced by an index. A availability RPC gives early feedback; the index also handles races. Auth enforces email uniqueness and may conceal duplicate accounts to prevent enumeration. Signup responses with empty identities are handled with a sign-in suggestion. Profile email is updated by an Auth trigger only after the email change takes effect.

## Configuration and secrets

Only these browser-safe values belong in the root `.env`:

| Variable                 | Meaning                                                 |
| ------------------------ | ------------------------------------------------------- |
| `VITE_SUPABASE_URL`      | Public Supabase API URL                                 |
| `VITE_SUPABASE_ANON_KEY` | Publishable key or legacy anon key; RLS enforces access |
| `VITE_VAPID_PUBLIC_KEY`  | Public Web Push application key                         |

**Never put privileged keys in a `VITE_` variable.** All such variables are included in browser bundles.

Server-only Edge Function secrets:

| Variable                                    | Meaning                                                        |
| ------------------------------------------- | -------------------------------------------------------------- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase injects these into deployed functions                 |
| `PUBLIC_SUPABASE_URL`                       | Browser-reachable Supabase URL used for notification actions   |
| `APP_ORIGIN`                                | Exact frontend origin, such as `https://reminders.example.com` |
| `SCHEDULER_SECRET`                          | Random secret authorizing cron dispatch                        |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`     | Matching public/private Web Push keys                          |
| `VAPID_SUBJECT`                             | Contact URI, e.g. `mailto:ops@example.com`                     |

Generate VAPID keys with the focused Web Push CLI, outside the browser:

```powershell
npx web-push generate-vapid-keys
```

Use the generated public key in both the frontend and function configuration. Save server secrets to an ignored file such as `supabase/.env.local`, then:

```powershell
npx supabase secrets set --env-file supabase/.env.local
npx supabase functions deploy dispatch-reminders
npx supabase functions deploy notification-action
```

Both functions keep gateway JWT verification enabled in `config.toml`. Cron and service-worker requests include the project's legacy **public anon JWT** for the gateway. Dispatch additionally checks its own scheduler secret; notification actions additionally validate a random 256-bit, occurrence-scoped capability. The service worker does not need access to a user's session or refresh token. The public gateway key grants no privileged access; RLS still enforces ownership. Action tokens expire after eight days. An exact-origin CORS check provides an additional restriction, not the authentication boundary.

For local functions, use `npx supabase functions serve --env-file supabase/.env.local`. Local `PUBLIC_SUPABASE_URL` should be `http://127.0.0.1:54321`; match `APP_ORIGIN` to the origin actually opened in the browser. `localhost` and `127.0.0.1` are different origins.

## Scheduler setup

Use the Supabase SQL editor to securely create three Vault secrets named `reminder_project_url` (your Supabase URL), `reminder_scheduler_secret` (the same random value as `SCHEDULER_SECRET`), and `reminder_anon_key` (the legacy public anon JWT from Project Settings → API Keys → Legacy keys). Generate at least 32 random bytes for the scheduler secret. Enter secrets directly through the dashboard/Vault or a secure administration session; never commit them to SQL files. Edge dispatch reads the injected `SUPABASE_ANON_KEY` to attach the public gateway JWT to notification actions. A new `sb_publishable_` key is valid for the frontend but is not a replacement for this legacy JWT at the functions gateway.

Then run [supabase/schedule.sql](supabase/schedule.sql). It installs `pg_cron`/`pg_net` and idempotently registers a once-per-minute job. This follows [Supabase's scheduled Edge Function architecture](https://supabase.com/docs/guides/functions/schedule-functions).

Timing is approximately minute resolution, with additional browser/provider delivery latency. The tab staying open is never required for scheduling. Monitor cron job results, `net._http_response`, Edge Function logs, and failed delivery rows in Supabase. Dispatch logs contain counts only, not titles, subscription endpoints, or action tokens. A dispatch invocation handles up to 100 due base occurrences, 100 snoozed occurrences, and 50 device deliveries; remaining work is drained on subsequent cron invocations. Scale those bounded batch limits and job frequency if actual usage requires it.

### Reliability and actions

- Due reminders are locked with `FOR UPDATE SKIP LOCKED`. Occurrence creation and advancing the next schedule occur in one database transaction.
- A unique `(reminder_id, scheduled_at)` constraint and per-device/generation delivery constraint prevent duplicate enqueueing.
- Delivery jobs have two-minute leases, token-checked completion, five bounded attempts, and exponential retry delay. Completed device sends are not repeated when another device fails.
- A crash after a push provider accepts a message but before completion commits can cause a retry. Exactly-once delivery across HTTP and PostgreSQL is impossible here; stable notification tags replace a duplicate displayed notification where supported. The retry limit prevents uncontrolled duplication.
- A late scheduler sends one due occurrence and advances beyond now, instead of replaying every missed occurrence.
- Done acknowledges only the current occurrence. The recurrence has already advanced normally when it was enqueued.
- Snooze records a one-time due timestamp and increments the occurrence generation. Repeated action requests are idempotent. The underlying recurrence and next base occurrence stay unchanged.
- Editing schedule fields or pausing cancels pending/snoozed occurrence work. Resume calculates the next strictly future occurrence from the original anchor. Deletion cascades delivery/action records.
- Provider HTTP 404/410 responses remove expired subscriptions. Browser installations may register multiple subscriptions for one account. Logout unregisters the current installation before clearing the session, to avoid reminders appearing after account changes.
- Outgoing push endpoints are restricted to Google, Mozilla, Apple, and Windows push providers to prevent server-side request forgery. Add a verified provider explicitly if another browser requires one.
- Work is rechecked before sending, but a push already in transit when a reminder is paused/deleted or a device signs out cannot be recalled. Offline actions report failure and allow retry; they are not silently treated as complete.
- Transient occurrence/delivery state is cleaned after eight days; there is no completion history subsystem. Unfinished snoozes are retained until dispatch.

## Architecture

```text
src/
  app/                 App initialization
  components/          Shared accessible controls and dialogs
  features/reminders/  Reminder form and cards
  features/notifications/ Device subscription service and explanatory permission UI
  hooks/               Session, connectivity, synchronization
  layouts/             Responsive navigation and page shell
  lib/                 Supabase client, validation, errors, recurrence
  pages/               Route composition and user interactions
  routes/              Auth and protected routes
  services/            Auth/profile and reminder data access
  store/               Small Redux auth/reminder slices
  types/               Domain types
supabase/
  migrations/          Reproducible schema, RLS, privileges, triggers, scheduler RPCs
  functions/           Push dispatch and notification action endpoints
public/                Manifest, icons, service worker, offline page
```

The database is authoritative for next occurrence timestamps. The TypeScript recurrence module provides a form preview; parity tests compare its results with PostgreSQL. Redux stores a client view of auth and reminders, never a second persistent database. Supabase Realtime refreshes reminders on changes; coming online or returning to the tab refreshes them too. Failed refreshes are surfaced with a retry button. List ordering is stable by creation time. Authentication changes clear the reminder slice and invalidate in-flight list responses.

### Calendar semantics

Use IANA time zone identifiers. Day/week recurrence advances local calendar dates; month/year recurrence is anchored to the original date, clamping unavailable dates. January 31 → February 28 → March 31; leap-day annual reminders recover February 29 in leap years. The end date is inclusive in the reminder's zone. Next occurrence is strictly later than the evaluation instant. Exhausted schedules show `Ended`, with no next notification.

DST gaps move the intended wall-clock time forward by the gap; overlapping wall-clock times choose the later instant. This explicitly matches PostgreSQL's time zone interpretation. The small Temporal polyfill is used for deterministic client calculations. Snooze is an elapsed number of minutes, independent of calendar recurrence.

### Database security

All application tables enable RLS. Profile/reminder/subscription policies enforce `auth.uid()` ownership. Profile writes are restricted to the username column. Reminder ownership, timestamps, and next occurrence are not writable by authenticated clients; triggers calculate scheduling. Clients cannot read notification capabilities or delivery state or execute scheduler/action RPCs. Only the server service role can dispatch or apply token-authorized actions. SQL constraints validate title length, recurrence, date/end relationships, snooze limits, keys, and timezone. Privileged functions use a fixed empty search path.

Subscription registration is a narrow authenticated RPC: an installation can move to another signed-in account only with the same endpoint and encryption keys. Pending deliveries to a transferred device are removed. Account ownership checks are repeated before push sends.

## PWA and offline behavior

The production build stamps the service worker with a content-derived version and precaches the app shell and hashed assets. It never caches Supabase API or Auth responses, personal records, or notification tokens. Offline navigation loads the shell after an initial online install; first-time offline navigation falls back to an explanatory offline page. Reminder editing/sync is online-only. Cached client state remains only in memory; it is cleared on logout.

Updates wait for existing tabs to close before activation, to keep shell and assets consistent. Close and reopen all installed app windows to apply an update. Development uses an unversioned worker with only the fallback resources. When debugging, unregister older workers in browser DevTools if they interfere with a dev session.

Use HTTPS in production; `localhost`/`127.0.0.1` are secure-context development exceptions. The UI asks for permission only after explaining notifications and the user presses **Enable notifications**. Notification action buttons depend on the platform. Opening the notification body focuses the app and opens the relevant edit screen. iOS/iPadOS users must install to the Home Screen on a supported OS version to receive Web Push. Platforms without action support still open the reminder context. The native install button appears where the browser supports its install event; otherwise use the browser's Add to Home Screen / Install menu.

The app assumes hosting at the **origin root**, not `/reminder-pwa/`. XAMPP's source folder is a development workspace, not a PHP application. Use Vite for local development or set a virtual host document root to `dist` for static production testing.

## Verification

Use `npm run format` to format source, tests, configuration, and documentation with Prettier.
Use `npm run format:check` to check formatting without changing files; this also runs as part of `npm run check`.
Formatting uses two-space indentation, single quotes in JavaScript/TypeScript, and a 100-column target.
Generated output, dependencies, and local environment files are excluded. SQL, TOML, and PowerShell files are not formatted by Prettier.

```powershell
npm run typecheck
npm run lint
npm test
npm run build
# Or all of the above:
npm run check
npm run preview
```

Tests cover recurrence intervals, month/year boundaries, leap days, DST gaps/overlaps, end dates, pause/resume, snooze, input validation, auth redirects/credential errors/registration validation/recovery, and the actual migration against a disposable PGlite PostgreSQL engine. Database tests mock only the small Supabase Auth schema/`auth.uid()` entry point; RLS, column privileges, indexes, triggers, leases, SQL recurrence, and action idempotency execute in PostgreSQL. PGlite is a **test-only dependency** and is never used to store application data. These tests do not replace hosted integration testing of GoTrue, Realtime, Vault, pg_cron, pg_net, Edge runtime, and real push providers.

With Deno installed, type-check functions separately:

```powershell
deno check --config supabase/functions/deno.json supabase/functions/dispatch-reminders/index.ts supabase/functions/notification-action/index.ts
```

Before enabling production dispatch, test on a configured staging project:

1. Register two users, confirm emails, test wrong credentials, recovery, email change, profile update, session restoration, and logout.
2. Create, edit, pause/resume, and delete reminders on a phone; sign in on a second device and confirm synchronization.
3. Enable push on two devices. Create a reminder due shortly. Close the app and confirm delivery, Open, Snooze, and Done where supported.
4. Reinvoke dispatch and duplicate action requests; verify no duplicate outbox jobs or changes to the base schedule.
5. Test blocked permission, revoked/expired subscriptions, offline actions, offline shell, install, and update behavior.
6. Confirm scheduler failures/retries are visible in logs and failed delivery rows, and verify RLS with real user JWTs.

The local app is connected to the hosted **reminder-pwa** project. See [docs/SUPABASE-SETUP.md](docs/SUPABASE-SETUP.md) for its project reference, configured origin, and deployment notes. Real device push delivery and user signup confirmation still require browser/user testing; local source tests do not claim live notification delivery.

## Production deployment

1. Apply migrations to your Supabase project and configure Auth/SMTP/redirect URLs.
2. Set Edge secrets, deploy both functions, configure Vault, and apply `supabase/schedule.sql`.
3. Set the three browser-safe variables for your production frontend build.
4. Run `npm ci`, `npm run check`, and the Deno check.
5. Deploy `dist/` to any HTTPS static host at the origin root. Configure SPA fallback to `/index.html` for client routes, without rewriting real files, `/sw.js`, or `/manifest.webmanifest`.
6. Serve `sw.js`, `index.html`, and the manifest with revalidation (`Cache-Control: no-cache`). Hashed `/assets/` files can use one-year immutable caching. Serve the manifest as `application/manifest+json` and the worker as JavaScript.
7. Confirm manifest/icon URLs, deep-link reloads, function CORS origin, cron delivery, RLS, and mobile installation in staging before release.

No categories, tags, calendar integrations, analytics, sharing, or offline editing are included in V1.
