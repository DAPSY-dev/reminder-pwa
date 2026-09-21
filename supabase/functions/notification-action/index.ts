import { admin, json, secret } from '../_shared/http.ts';

Deno.serve(async (request) => {
  let cors: Record<string, string> = {};
  try {
    const origin = request.headers.get('Origin');
    const expected = new URL(secret('APP_ORIGIN'));
    const allowed = new Set([expected.origin, 'https://reminder.free.bg']);
    // The two local development hostnames have separate service worker origins.
    if (['localhost', '127.0.0.1'].includes(expected.hostname)) {
      const alias = new URL(expected);
      alias.hostname = expected.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
      allowed.add(alias.origin);
    }
    if (!origin || !allowed.has(origin)) return json({ error: 'Forbidden' }, 403);
    cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type, authorization, apikey',
      Vary: 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
    const bodyText = await request.text();
    if (bodyText.length > 2048) return json({ error: 'Invalid request' }, 400, cors);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(bodyText);
    } catch {
      return json({ error: 'Invalid request' }, 400, cors);
    }
    if (
      !body ||
      typeof body !== 'object' ||
      typeof body.occurrenceId !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(body.occurrenceId) ||
      typeof body.token !== 'string' ||
      !/^[0-9a-f]{64}$/.test(body.token) ||
      typeof body.generation !== 'number' ||
      !Number.isInteger(body.generation) ||
      body.generation < 0 ||
      !['done', 'snooze'].includes(String(body.action))
    )
      return json({ error: 'Invalid request' }, 400, cors);
    const { data, error } = await admin().rpc('apply_notification_action', {
      p_occurrence_id: body.occurrenceId,
      p_token: body.token,
      p_generation: body.generation,
      p_action: body.action,
    });
    if (error) throw error;
    return data
      ? json({ ok: true }, 200, cors)
      : json({ error: 'This notification has expired' }, 410, cors);
  } catch {
    console.error('Notification action failed');
    return json({ error: 'Could not apply action' }, 500, cors);
  }
});
