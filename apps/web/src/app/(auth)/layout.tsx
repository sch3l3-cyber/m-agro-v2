export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-full flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <p className="mb-8 text-center text-3xl font-bold tracking-tight text-list-700">M-AGRO</p>
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">{children}</div>
      </div>
    </main>
  );
}
