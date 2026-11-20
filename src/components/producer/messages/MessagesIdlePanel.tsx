"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * Painel de Mensagens sem conversa aberta. Abrir a aba não marca nada como lido:
 * a leitura só acontece ao abrir uma conversa.
 */
export function MessagesIdlePanel({
  total,
  pendingCount,
  nextPendingId,
  storeUrl,
}: {
  total: number;
  pendingCount: number;
  /** Consulta pendente mais antiga. */
  nextPendingId: string | null;
  /** Link público da loja, se já houver loja publicada. */
  storeUrl: string | null;
}) {
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);

  const copy = async () => {
    if (!storeUrl) return;
    try {
      await navigator.clipboard.writeText(storeUrl);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
  };

  let body: React.ReactNode;
  if (total === 0) {
    body = (
      <>
        <p className="mt-2 max-w-md text-sm text-mist">
          {storeUrl
            ? "As consultas chegam aqui, traduzidas. Compartilhe o link da loja para receber a primeira."
            : "As consultas chegam aqui, traduzidas. Publique um produto para ter link e QR."}
        </p>
        {storeUrl ? (
          <div className="mt-4">
            <button
              type="button"
              onClick={copy}
              className="inline-flex min-h-11 items-center rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
            >
              Copiar link da loja
            </button>
            <p role="status" className="mt-2 min-h-5 text-sm text-mist">
              {copied === "ok" && "Link copiado."}
              {copied === "fail" && (
                <>
                  Não foi possível copiar. Link da loja: <span className="break-all text-snow">{storeUrl}</span>
                </>
              )}
            </p>
          </div>
        ) : (
          <p className="mt-4 text-sm">
            <Link href="/meu-espaco/produtos" className="text-coral underline underline-offset-4">
              Ir para Produtos
            </Link>
          </p>
        )}
      </>
    );
  } else if (nextPendingId) {
    body = (
      <>
        <p className="mt-2 max-w-md text-sm text-mist">
          {pendingCount === 1 ? "Há 1 consulta aguardando sua resposta." : `Há ${pendingCount} consultas aguardando sua resposta.`}{" "}
        </p>
        <Link
          href={`/meu-espaco/mensagens/${nextPendingId}`}
          className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
        >
          Abrir próxima consulta
        </Link>
      </>
    );
  } else {
    body = (
      <p className="mt-2 max-w-md text-sm text-mist">
        Todas as consultas foram respondidas.
      </p>
    );
  }

  return (
    <section aria-labelledby="mensagens-ocioso" className="rounded-xl border border-line bg-panel/60 p-6 sm:p-8">
      <h2 id="mensagens-ocioso" className="text-lg font-semibold text-snow">
        Conversas da loja
      </h2>
      {body}
    </section>
  );
}
