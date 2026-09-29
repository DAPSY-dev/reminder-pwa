# Configured Supabase project

- Project: **reminder-pwa** (DAPSY-dev)
- Reference: `ceopxrjkyqazccuipnlx`
- API URL: `https://ceopxrjkyqazccuipnlx.supabase.co`
- Local app origin: `http://127.0.0.1:5173`
- Vercel production origin: `https://recurring-reminder.vercel.app`

## Vercel deployment

The frontend is deployed to the `dapsy/reminder-pwa` Vercel project. Its production
environment contains only the three public `VITE_` settings. `vercel.json` configures
the Vite build, SPA routing, and service-worker/manifest cache revalidation.
`.vercelignore` excludes local environment files and Supabase server files from uploads.

Supabase Auth's hosted Site URL is `https://recurring-reminder.vercel.app`. Its redirect
allowlist includes `/auth`, `/auth?recovery=1`, and `/profile` on that origin, while
retaining the existing local redirects. The deployed
`notification-action` function also permits the exact Vercel production origin.
Other Vercel preview origins are not automatically allowed.

Deploy frontend updates with `npx vercel deploy --prod` after `npm run check`.
Deploy notification endpoint updates with its shared import map:

```powershell
npx supabase functions deploy notification-action --project-ref ceopxrjkyqazccuipnlx --import-map supabase/functions/deno.json
```

The local Vercel link and authentication files are ignored by Git. Commit the deployment
configuration and source changes to preserve them for future Git-based deployments.

## Existing setup

Browser configuration is stored in the ignored root `.env`. Push server secrets are stored in the ignored `supabase/.env.local`; keep this file private and backed up securely. Never copy its private VAPID key or scheduler secret into a `VITE_` variable.

The project supports local frontend development and `https://recurring-reminder.vercel.app`. For other deployments, add the exact origin to notification-action's allowed origins and the Auth redirect allowlist, then rebuild the frontend with the same Supabase URL/public key/public VAPID key.

Use the local app at **127.0.0.1:5173**, **localhost:5173**, or the hosted HTTPS origin. Notification action CORS permits both loopback hostnames when `APP_ORIGIN` is local, with the configured protocol and port, plus the explicit hosted origin `https://recurring-reminder.vercel.app`. No wildcard origins are allowed. New notification links are relative paths and open on the subscribing service worker's origin.

The initial migration is recorded as version `202609160001`. Further database changes should be added as new SQL migrations. Do not rerun the initial migration against the configured project.

For future CLI deployments, authenticate with your Supabase account and link this project:

```powershell
npx supabase login
npx supabase link --project-ref ceopxrjkyqazccuipnlx
npx supabase db push
npx supabase secrets set --env-file supabase/.env.local
npx supabase functions deploy dispatch-reminders
npx supabase functions deploy notification-action
```

The SQL scheduler uses Vault secrets rather than embedding the scheduler credential in cron job text. Monitor `cron.job_run_details`, `net._http_response`, Edge Function logs, and `push_deliveries` for failures.

Both Edge Functions retain gateway JWT verification. Cron requests and notification actions carry the project's public legacy anon gateway key; the dispatcher additionally checks its private scheduler secret, and notification actions check occurrence capabilities. Browser data access uses the publishable key and ownership policies.

Setup verification confirmed five tables with RLS enabled, eight ownership policies, the recorded migration, and an active once-per-minute cron job. Scheduled dispatcher responses returned HTTP 200 with zero pending deliveries. Anonymous table access and invalid function requests were rejected. Actual notification delivery still requires signing in, subscribing a device, and creating a due reminder.

Supabase's default email service is suitable for initial testing and has restrictions. Configure a custom SMTP provider before opening registration to general users. Email confirmation remains enabled.
