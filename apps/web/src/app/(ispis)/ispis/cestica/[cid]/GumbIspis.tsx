'use client';

export function GumbIspis() {
  return (
    <div className="mb-4 flex gap-2 print:hidden">
      <button type="button" onClick={() => window.print()} className="min-h-11 rounded-lg bg-list-600 px-4 font-semibold text-white hover:bg-list-700">
        Ispiši / Spremi kao PDF
      </button>
      <button type="button" onClick={() => history.back()} className="min-h-11 rounded-lg px-4 font-semibold text-list-700 ring-1 ring-zinc-300">
        Natrag
      </button>
    </div>
  );
}
