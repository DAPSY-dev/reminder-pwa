import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

async function endpoint(appOrigin = 'http://127.0.0.1:5173', fail = false) {
  const rpc = vi.fn().mockResolvedValue({ data: true, error: fail ? new Error('database') : null });
  let handler: (request: Request) => Promise<Response>;
  const source = (
    await readFile('supabase/functions/notification-action/index.ts', 'utf8')
  ).replace(/^import .*;\r?\n/, '');
  runInNewContext(ts.transpile(source, { target: ts.ScriptTarget.ES2022 }), {
    Deno: {
      serve: (value: typeof handler) => {
        handler = value;
      },
    },
    URL,
    Response,
    console: { error: vi.fn() },
    secret: () => appOrigin,
    admin: () => ({ rpc }),
    json: (body: unknown, status = 200, headers = {}) =>
      new Response(JSON.stringify(body), { status, headers }),
  });
  return {
    request: (origin: string, method = 'OPTIONS') =>
      handler(
        new Request('https://db.example.com/action', {
          method,
          headers: { Origin: origin },
          ...(method === 'POST'
            ? {
                body: JSON.stringify({
                  occurrenceId: '12345678-1234-1234-1234-123456789abc',
                  token: 'a'.repeat(64),
                  generation: 0,
                  action: 'done',
                }),
              }
            : {}),
        }),
      ),
    rpc,
  };
}
describe('notification action origin handling', () => {
  it.each([
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://recurring-reminder.vercel.app',
  ])('accepts preflight and action from %s', async (origin) => {
    const action = await endpoint();
    const preflight = await action.request(origin);
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    expect((await action.request(origin, 'POST')).status).toBe(200);
    expect(action.rpc).toHaveBeenCalledOnce();
  });
  it.each([
    'http://localhost:5174',
    'https://evil.example',
    'http://localhost.evil.example:5173',
    'http://recurring-reminder.vercel.app',
    'https://retired.example',
    'https://untrusted.example',
    'https://recurring-reminder.vercel.app.evil.example',
    'https://other.vercel.app',
  ])('rejects %s without applying an action', async (origin) => {
    const action = await endpoint();
    expect((await action.request(origin, 'POST')).status).toBe(403);
    expect(action.rpc).not.toHaveBeenCalled();
  });
  it('does not allow loopback aliases for a deployed HTTPS app', async () => {
    expect(
      (await (await endpoint('https://app.example.com')).request('http://localhost:5173')).status,
    ).toBe(403);
  });
  it('preserves CORS headers on database failures', async () => {
    const response = await (
      await endpoint(undefined, true)
    ).request('http://localhost:5173', 'POST');
    expect(response.status).toBe(500);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
  });
});
