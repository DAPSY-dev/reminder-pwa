import { readFile } from 'node:fs/promises';

function parseEnv(text) {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((line) => /^[A-Z_][A-Z0-9_]*=/.test(line))
      .map((line) => {
        const position = line.indexOf('=');
        return [
          line.slice(0, position),
          line
            .slice(position + 1)
            .trim()
            .replace(/^['"]|['"]$/g, ''),
        ];
      }),
  );
}
const env = parseEnv(await readFile('.env', 'utf8'));
const secrets = parseEnv(await readFile('supabase/.env.local', 'utf8'));
const url = new URL(env.VITE_SUPABASE_URL);
if (url.origin !== 'https://ceopxrjkyqazccuipnlx.supabase.co')
  throw new Error('This verification script is scoped to the configured reminder-pwa project.');
const publicHeaders = { apikey: env.VITE_SUPABASE_ANON_KEY };
const gatewayHeaders = {
  apikey: secrets.PUBLIC_SUPABASE_ANON_KEY,
  Authorization: `Bearer ${secrets.PUBLIC_SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};
async function check(name, path, expected, options = {}) {
  const response = await fetch(new URL(path, url), {
    headers: publicHeaders,
    ...options,
    signal: AbortSignal.timeout(30000),
  });
  if (response.status !== expected)
    throw new Error(`${name}: expected HTTP ${expected}, received HTTP ${response.status}`);
  console.info(`${name}: HTTP ${response.status}`);
  return response;
}
for (const table of [
  'profiles',
  'reminders',
  'push_subscriptions',
  'notification_occurrences',
  'push_deliveries',
]) {
  const response = await check(
    `Anonymous ${table} access blocked`,
    `/rest/v1/${table}?select=id`,
    401,
  );
  await response.arrayBuffer();
}
await check('Username availability RPC', '/rest/v1/rpc/username_available', 200, {
  method: 'POST',
  headers: { ...publicHeaders, 'Content-Type': 'application/json' },
  body: JSON.stringify({ p_username: 'setup_probe_unclaimed' }),
});
await check('Gateway rejects requests without a JWT', '/functions/v1/dispatch-reminders', 401, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{}',
});
await check(
  'Dispatcher rejects invalid scheduler secret',
  '/functions/v1/dispatch-reminders',
  401,
  { method: 'POST', headers: { ...gatewayHeaders, 'x-scheduler-secret': 'invalid' }, body: '{}' },
);
await check('Action endpoint rejects foreign origins', '/functions/v1/notification-action', 403, {
  method: 'POST',
  headers: { ...gatewayHeaders, Origin: 'https://invalid.example' },
  body: '{}',
});
await check(
  'Action endpoint validates occurrence payload',
  '/functions/v1/notification-action',
  400,
  { method: 'POST', headers: { ...gatewayHeaders, Origin: secrets.APP_ORIGIN }, body: '{}' },
);
for (const origin of [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://reminder.free.bg',
]) {
  const response = await check(
    `Notification action preflight for ${origin}`,
    '/functions/v1/notification-action',
    204,
    {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,apikey,content-type',
      },
    },
  );
  if (response.headers.get('Access-Control-Allow-Origin') !== origin)
    throw new Error('Incorrect CORS allow-origin');
  const invalid = await check(
    `Invalid action payload from ${origin} rejected`,
    '/functions/v1/notification-action',
    400,
    {
      method: 'POST',
      headers: { ...gatewayHeaders, Origin: origin },
      body: '{}',
    },
  );
  if (invalid.headers.get('Access-Control-Allow-Origin') !== origin)
    throw new Error('Missing CORS headers on validation response');
}
