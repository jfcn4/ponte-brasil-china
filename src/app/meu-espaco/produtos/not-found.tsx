import Link from "next/link";

export default function ProductNotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
      <h1 className="text-xl font-semibold text-snow">Produto não encontrado neste espaço</h1>
      <p className="mt-3 text-mist">
        Ele pode pertencer a outra loja ou a outro navegador. Cada navegador acessa apenas os produtos da própria loja.
      </p>
      <Link
        href="/meu-espaco/produtos"
        className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-brand px-5 font-semibold text-white"
      >
        Ver meus produtos
      </Link>
    </div>
  );
}
