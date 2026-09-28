'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { mfaIskljuci, mfaPotvrdiUkljucivanje, mfaZapocni } from '../actions';

/** Uključi/isključi TOTP. QR se prikazuje kao <img> (data URI SVG iz Supabasea). */
export function MfaPostavke({ ukljuceno, factorId }: { ukljuceno: boolean; factorId: string | null }) {
  const router = useRouter();
  const [novi, setNovi] = useState<{ factorId: string; qr: string; tajna: string } | null>(null);
  const [kod, setKod] = useState('');
  const [poruka, setPoruka] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (ukljuceno)
    return (
      <div className="flex flex-col gap-3">
        <p className="rounded-lg bg-green-50 p-3 text-sm text-green-900">✓ Dvofaktorska prijava je uključena. Pri svakoj prijavi traži se kod iz aplikacije.</p>
        {poruka && <p role="alert" className="text-sm text-red-700">{poruka}</p>}
        <Button
          variant="ghost"
          disabled={pending}
          onClick={() =>
            start(async () => {
              if (!factorId) return;
              const r = await mfaIskljuci(factorId);
              if (!r.ok) return setPoruka(r.poruka);
              router.refresh();
            })
          }
        >
          Isključi dvofaktorsku prijavu
        </Button>
      </div>
    );

  if (!novi)
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-zinc-700">
          Uz lozinku traži se i 6-znamenkasti kod s tvog mobitela. Ako netko sazna lozinku, bez mobitela ne može u tvoje podatke.
        </p>
        {poruka && <p role="alert" className="text-sm text-red-700">{poruka}</p>}
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              setPoruka(null);
              const r = await mfaZapocni();
              if (!r.ok) return setPoruka(r.poruka);
              setNovi(r);
            })
          }
        >
          Uključi dvofaktorsku prijavu
        </Button>
      </div>
    );

  return (
    <div className="flex flex-col gap-3">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-700">
        <li>Instaliraj aplikaciju za autentifikaciju (Google Authenticator, Microsoft Authenticator…).</li>
        <li>U njoj odaberi „dodaj račun” i skeniraj QR kod.</li>
        <li>Upiši 6-znamenkasti kod koji aplikacija pokaže.</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element -- data URI SVG, nema što optimizirati */}
      <img src={novi.qr} alt="QR kod za aplikaciju za autentifikaciju" className="mx-auto h-48 w-48 rounded-lg bg-white p-2 ring-1 ring-zinc-200" />
      <details className="text-xs text-zinc-600">
        <summary className="cursor-pointer">Ne možeš skenirati? Upiši ključ ručno</summary>
        <code className="mt-1 block break-all rounded bg-zinc-100 p-2 font-mono">{novi.tajna}</code>
      </details>
      <input
        value={kod}
        onChange={(e) => setKod(e.target.value)}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={7}
        placeholder="123 456"
        aria-label="Kod iz aplikacije"
        className="min-h-12 rounded-lg border border-zinc-300 bg-white px-3 text-center font-mono text-2xl tracking-widest"
      />
      {poruka && <p role="alert" className="text-sm text-red-700">{poruka}</p>}
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await mfaPotvrdiUkljucivanje(novi.factorId, kod);
            if (!r.ok) return setPoruka(r.poruka);
            setNovi(null);
            router.refresh();
          })
        }
      >
        {pending ? 'Provjeravam…' : 'Potvrdi i uključi'}
      </Button>
    </div>
  );
}
