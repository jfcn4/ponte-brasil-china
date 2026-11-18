export default function SpaceLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando…</span>
      <div className="h-8 w-48 animate-pulse rounded bg-panel" />
      <div className="mt-6 space-y-3">
        {[0, 1].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-panel" />
        ))}
      </div>
    </div>
  );
}
