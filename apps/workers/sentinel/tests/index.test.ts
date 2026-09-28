import { describe, expect, it } from 'vitest';
import worker, { type Env } from '../src/index';

const env: Env = { ALLOWED_ORIGINS: 'http://localhost:3000, https://m-agro.hr' };
const call = (path: string, init?: RequestInit) => worker.fetch(new Request(`https://w.test${path}`, init), env);

describe('sentinel worker (skeleton)', () => {
  it('/health vraća ok', async () => {
    const r = await call('/health');
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ status: 'ok' });
  });

  it('nepoznata ruta → 404', async () => {
    expect((await call('/stats')).status).toBe(404);
  });

  it('CORS samo za dozvoljene origine', async () => {
    const ok = await call('/health', { headers: { origin: 'https://m-agro.hr' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://m-agro.hr');
    const bad = await call('/health', { headers: { origin: 'https://evil.com' } });
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
  });
});
