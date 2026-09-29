import 'server-only';
import { AIGreska, type AIClient, type ChatDio } from './types';

/**
 * Claude Messages API preko fetch-a (bez SDK-a: worker ima 3 MiB limit).
 * Cijene u USD po milijun tokena — ažurirati ako se promijeni model (platform.claude.com/docs/en/about-claude/pricing).
 */
const CIJENE: Record<string, { ulaz: number; izlaz: number }> = {
  'claude-sonnet-5-5': { ulaz: 2, izlaz: 10 },
  'claude-haiku-4-5': { ulaz: 1, izlaz: 5 },
};
const ZADANA_CIJENA = { ulaz: 5, izlaz: 25 }; // nepoznat model → konzervativno (budžet se prije potroši nego prekorači)

export function cijenaUsd(model: string, ulaz: number, izlaz: number): number {
  const c = CIJENE[model] ?? Object.entries(CIJENE).find(([k]) => model.startsWith(k))?.[1] ?? ZADANA_CIJENA;
  return (ulaz * c.ulaz + izlaz * c.izlaz) / 1_000_000;
}

/** Parsira SSE tok (event: …\ndata: {...}\n\n) u JSON objekte. */
export async function* sseDogadaji(tijelo: ReadableStream<Uint8Array>): AsyncGenerator<Record<string, unknown>> {
  const dekoder = new TextDecoder();
  const citac = tijelo.getReader();
  let buf = '';
  for (;;) {
    const { value, done } = await citac.read();
    if (done) break;
    buf += dekoder.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const blok = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const data = blok
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim())
        .join('');
      if (data) yield JSON.parse(data) as Record<string, unknown>;
    }
  }
}

export function anthropicKlijent(apiKey: string, model: string): AIClient {
  return {
    model,
    async *stream(poruke, opts): AsyncGenerator<ChatDio> {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: opts.signal ?? AbortSignal.timeout(90_000),
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model,
          max_tokens: opts.maxTokena ?? 1024,
          stream: true,
          system: opts.sustav,
          messages: poruke.map((p) => ({ role: p.uloga === 'korisnik' ? 'user' : 'assistant', content: p.tekst })),
        }),
      });
      if (!r.ok || !r.body) {
        const tekst = await r.text().catch(() => '');
        throw new AIGreska(`Claude API ${r.status}: ${tekst.slice(0, 300)}`, r.status);
      }
      let ulaz = 0;
      let izlaz = 0;
      for await (const d of sseDogadaji(r.body)) {
        const tip = d.type;
        if (tip === 'message_start') {
          const u = (d.message as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
          ulaz = u?.input_tokens ?? 0;
          izlaz = u?.output_tokens ?? 0;
        } else if (tip === 'content_block_delta') {
          const delta = d.delta as { type?: string; text?: string };
          if (delta.type === 'text_delta' && delta.text) yield { vrsta: 'tekst', tekst: delta.text };
        } else if (tip === 'message_delta') {
          const u = d.usage as { output_tokens?: number } | undefined;
          if (u?.output_tokens) izlaz = u.output_tokens;
        } else if (tip === 'error') {
          throw new AIGreska(`Claude API: ${JSON.stringify(d.error).slice(0, 300)}`, 500);
        }
      }
      yield { vrsta: 'kraj', ulazTokena: ulaz, izlazTokena: izlaz, usd: cijenaUsd(model, ulaz, izlaz) };
    },
  };
}
