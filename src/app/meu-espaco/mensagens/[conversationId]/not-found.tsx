import Link from "next/link";

export default function ConversationNotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
      <h1 className="text-xl font-semibold text-snow">Conversa não encontrada</h1>
      <p className="mt-3 text-mist">Esta conversa não existe ou pertence a outra loja.</p>
      <Link
        href="/meu-espaco/mensagens"
        className="mt-6 inline-flex min-h-11 items-center rounded-lg border border-line px-5 font-medium text-snow hover:border-coral"
      >
        Voltar às mensagens
      </Link>
    </div>
  );
}
