import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-4 py-24 text-center sm:px-6">
      <h1 className="text-2xl font-semibold text-snow">Página não encontrada</h1>
      <Link href="/" className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-brand px-5 font-semibold text-white">
        Voltar ao início
      </Link>
    </main>
  );
}
