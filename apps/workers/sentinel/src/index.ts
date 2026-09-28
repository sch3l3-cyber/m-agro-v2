/**
 * Sentinel Hub proxy — Faza 0: samo skeleton + /health.
 * Faza 2 porta v1 worker.js (auth, /dates, /stats BEZ resx/resy, /process) + shared cache.
 */
export interface Env {
  ALLOWED_ORIGINS: string;
}

const json = (body: unknown, status = 200, extra: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });

export function corsHeaders(origin: string | null, env: Env): HeadersInit {
  const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
  if (!origin || !allowed.includes(origin)) return {};
  return { 'access-control-allow-origin': origin, vary: 'Origin' };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const cors = corsHeaders(request.headers.get('origin'), env);

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ status: 'ok', service: 'sentinel', phase: 0 }, 200, cors);
    }
    return json({ error: 'not_found' }, 404, cors);
  },
} satisfies ExportedHandler<Env>;
