import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { cijenaUsd, sseDogadaji, anthropicKlijent } = await import('@/lib/ai/anthropic');

function tok(dijelovi: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const d of dijelovi) c.enqueue(enc.encode(d));
      c.close();
    },
  });
}

const SSE = [
  'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":1000,"output_tokens":1}}}\n\n',
  'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Pri"}}\n\nevent: content_block_delta\ndata: {"type":"content_block_',
  'delta","index":0,"delta":{"type":"text_delta","text":"hrana"}}\n\n',
  'event: ping\ndata: {"type":"ping"}\n\n',
  'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":200}}\n\n',
  'event: message_stop\ndata: {"type":"message_stop"}\n\n',
];

describe('Claude SSE', () => {
  it('parsira događaje i kad su razlomljeni između paketa', async () => {
    const tipovi: unknown[] = [];
    for await (const d of sseDogadaji(tok(SSE))) tipovi.push(d.type);
    expect(tipovi).toEqual(['message_start', 'content_block_delta', 'content_block_delta', 'ping', 'message_delta', 'message_stop']);
  });

  it('klijent vraća tekst i trošak', async () => {
    const fetchMock = vi.fn(async () => new Response(tok(SSE), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const k = anthropicKlijent('test', 'claude-sonnet-5-5');
    const dijelovi = [];
    for await (const d of k.stream([{ uloga: 'korisnik', tekst: 'hej' }], { sustav: 's' })) dijelovi.push(d);
    expect(dijelovi.filter((d) => d.vrsta === 'tekst').map((d) => (d as { tekst: string }).tekst).join('')).toBe('Prihrana');
    expect(dijelovi.at(-1)).toEqual({ vrsta: 'kraj', ulazTokena: 1000, izlazTokena: 200, usd: cijenaUsd('claude-sonnet-5-5', 1000, 200) });
    const tijelo = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(tijelo.messages).toEqual([{ role: 'user', content: 'hej' }]);
    vi.unstubAllGlobals();
  });

  it('cijena: poznat i nepoznat model', () => {
    expect(cijenaUsd('claude-sonnet-5-5', 1_000_000, 0)).toBe(2);
    expect(cijenaUsd('claude-haiku-4-5-20251001', 0, 1_000_000)).toBe(5);
    expect(cijenaUsd('nepoznat', 1_000_000, 0)).toBe(5);
  });
});
