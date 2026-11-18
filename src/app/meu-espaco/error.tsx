"use client";

export default function SpaceError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6" role="alert">
      <h1 className="text-xl font-semibold text-snow">Não foi possível carregar seu espaço</h1>
      <p className="mt-3 text-mist">
        A conexão com o servidor falhou. Seus dados já salvos continuam guardados. Verifique a internet e tente de novo.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-strong"
      >
        Tentar novamente
      </button>
    </div>
  );
}
