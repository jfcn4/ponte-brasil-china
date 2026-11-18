import type { Metadata } from "next";

export const metadata: Metadata = { title: "Mensagens" };

export default function MessagesPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-snow">Mensagens</h1>
      <div className="mt-6 rounded-xl border border-dashed border-line bg-panel/50 p-8 text-center">
        <p className="font-medium text-snow">Nenhuma conversa ainda</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-mist">
          As consultas dos compradores chegam aqui depois que você publicar e compartilhar sua vitrine. A publicação será
          liberada na próxima versão.
        </p>
      </div>
    </div>
  );
}
