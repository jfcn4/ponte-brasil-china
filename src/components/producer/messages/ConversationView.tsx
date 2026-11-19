"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/client/fetch-json";
import {
  AI_ERROR_MESSAGES,
  LANG_LABELS,
  LIMITS,
  buyerLabel,
  type ConversationDetail,
  type DraftView,
  type ProducerMessageView,
} from "@/modules/messaging/schema";
import { formatBrl, formatCny } from "@/modules/products/pricing";
import { ConversationStatus } from "./ConversationList";

const POLL_MS = 8_000;
/** Espera antes de repetir sozinho uma análise que falhou por instabilidade da IA. */
const AUTO_RETRY_MS = 4_000;
/** Pausa na digitação antes de traduzir automaticamente. */
const AUTO_TRANSLATE_MS = 1_200;
const OFFLINE = "Sem conexão com o servidor. Seu texto continua aqui; tente novamente quando a conexão voltar.";

const timeFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

type Notice = { tone: "error" | "ok"; text: string } | null;
type BuyerMessage = Extract<ProducerMessageView, { author: "buyer" }>;

function langName(lang: string) {
  return LANG_LABELS[lang] ?? "outro idioma";
}

function lastBuyerMessage(detail: ConversationDetail): BuyerMessage | null {
  for (let i = detail.messages.length - 1; i >= 0; i -= 1) {
    const m = detail.messages[i]!;
    if (m.author === "buyer") return m;
  }
  return null;
}

/** Notifica a navegação (badge) e a lista de que o estado das conversas mudou. */
function announceChange() {
  window.dispatchEvent(new Event("pg:messages-changed"));
}

/**
 * Conversa no painel do produtor. A tradução em português abre cada entrada;
 * o copiloto fica discreto ao lado. A resposta é escrita em português e a
 * prévia da tradução aparece sozinha quando o produtor para de digitar.
 * Só “Confirmar envio” torna a resposta visível ao comprador; usar a sugestão
 * apenas preenche o editor.
 */
export function ConversationView({ initial }: { initial: ConversationDetail }) {
  const router = useRouter();
  const [detail, setDetail] = useState(initial);
  const [body, setBody] = useState(initial.draft?.body ?? "");
  const [translating, setTranslating] = useState(false);
  const [sending, setSending] = useState(false);
  const [retrying, setRetrying] = useState(false);
  /** Texto cuja tradução falhou: não repete sozinho até o produtor pedir ou editar. */
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const threadHeading = useRef<HTMLHeadingElement>(null);
  const threadEnd = useRef<HTMLLIElement>(null);
  const inflight = useRef(false);
  const detailRef = useRef(detail);
  useEffect(() => {
    detailRef.current = detail;
  }, [detail]);

  const refresh = useCallback(async () => {
    const result = await fetchJson<{ conversation: ConversationDetail }>(`/api/conversations/${initial.id}`);
    if (result.ok) setDetail(result.data.conversation);
    // Conversa excluída em outra aba (produto apagado): a página do servidor mostra a tela de indisponível.
    else if (result.status === 404) router.refresh();
  }, [initial.id, router]);

  // Atualização periódica (novas entradas, interpretação concluída).
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && !inflight.current) void refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  // Marca como lidas só as entradas que esta tela exibiu.
  const latestBuyer = lastBuyerMessage(detail);
  const lastShownBuyerSeq = latestBuyer?.seq ?? 0;
  useEffect(() => {
    if (lastShownBuyerSeq <= detail.readSeq) return;
    void fetchJson<{ readSeq: number }>(`/api/conversations/${detail.id}/read`, {
      method: "POST",
      json: { upToSeq: lastShownBuyerSeq },
    }).then((result) => {
      if (!result.ok) return;
      setDetail((current) => ({
        ...current,
        readSeq: result.data.readSeq,
        hasUnread: (lastBuyerMessage(current)?.seq ?? 0) > result.data.readSeq,
      }));
      announceChange();
    });
  }, [detail.id, detail.readSeq, lastShownBuyerSeq]);

  // Ao abrir uma conversa longa, começa pela última entrada do comprador, com o editor logo abaixo.
  const openedOn = useRef(latestBuyer?.id ?? null);
  useEffect(() => {
    const id = openedOn.current;
    const el = id ? document.getElementById(`pmsg-${id}`) : null;
    if (el && document.documentElement.scrollHeight > window.innerHeight) el.scrollIntoView({ block: "start" });
  }, []);

  // Mostra a mensagem mais recente quando o histórico cresce.
  const messageCount = detail.messages.length;
  const seenCount = useRef(messageCount);
  useEffect(() => {
    if (messageCount > seenCount.current) threadEnd.current?.scrollIntoView({ block: "nearest" });
    seenCount.current = messageCount;
  }, [messageCount]);

  const applyDraft = (next: DraftView | null) => setDetail((current) => ({ ...current, draft: next }));

  /** Grava o texto e traduz essa revisão exata (nada é enviado). */
  const translate = useCallback(
    async (text: string) => {
      if (inflight.current) return;
      inflight.current = true;
      setTranslating(true);
      const result = await fetchJson<{ draft: DraftView }>(
        `/api/conversations/${initial.id}/draft/translation`,
        { method: "POST", json: { expectedRevision: detailRef.current.draft?.revision ?? null, body: text } },
        OFFLINE,
      );
      inflight.current = false;
      setTranslating(false);
      if (result.ok) {
        applyDraft(result.data.draft);
        setFailedFor(null);
        return;
      }
      if (result.data && "draft" in result.data && result.data.draft) applyDraft(result.data.draft);
      // Texto mudou durante a tradução ou outra aba está traduzindo: o efeito agenda de novo.
      if (result.code === "translation_stale" || result.code === "translation_in_progress") return;
      if (result.code === "revision_conflict") {
        await refresh();
        return;
      }
      setFailedFor(text);
      setNotice({ tone: "error", text: result.message });
    },
    [initial.id, refresh],
  );

  const previewRef = useRef<HTMLDivElement>(null);
  const draft = detail.draft;
  const trimmed = body.trim();
  const translation = draft && draft.body === trimmed ? draft.translation : null;
  const ready = translation?.status === "ready" ? translation : null;

  // Tradução automática quando o produtor para de digitar.
  useEffect(() => {
    if (!trimmed || sending || translating || ready || failedFor === trimmed) return;
    const timer = setTimeout(() => void translate(trimmed), AUTO_TRANSLATE_MS);
    return () => clearTimeout(timer);
  }, [trimmed, sending, translating, ready, failedFor, translate]);

  const confirmSend = async () => {
    if (sending || !draft || !ready) return;
    setSending(true);
    setNotice(null);
    // Mesmo rascunho e revisão em cada repetição: o servidor não duplica o envio.
    const result = await fetchJson<{ conversation: ConversationDetail }>(
      `/api/conversations/${detail.id}/replies`,
      { method: "POST", json: { draftId: draft.id, expectedRevision: draft.revision, confirmed: true } },
      "Não foi possível confirmar o envio (sem conexão). Toque em “Confirmar envio” de novo: a resposta não será duplicada.",
    );
    setSending(false);
    if (result.ok) {
      setDetail(result.data.conversation);
      setBody("");
      setNotice({ tone: "ok", text: `Resposta enviada ao comprador em ${langName(ready.lang)}.` });
      announceChange();
      requestAnimationFrame(() => editor.current?.focus());
      return;
    }
    if (result.code === "translation_stale" || result.code === "revision_conflict") await refresh();
    setNotice({ tone: "error", text: result.message });
  };

  const retryInterpretation = async (messageId: string) => {
    if (retrying) return;
    setRetrying(true);
    setNotice(null);
    const result = await fetchJson<{ conversation: ConversationDetail }>(
      `/api/conversations/${detail.id}/messages/${messageId}/interpretation`,
      { method: "POST" },
      OFFLINE,
    );
    setRetrying(false);
    if (result.data && "conversation" in result.data && result.data.conversation) setDetail(result.data.conversation);
    if (!result.ok) {
      setNotice({ tone: "error", text: result.status === 502 ? "A tradução falhou de novo. A mensagem original continua salva." : result.message });
    }
  };

  // Instabilidade do provedor (503, tempo esgotado): repete sozinho uma vez por
  // entrada, alguns segundos depois. Saída inválida ou nova falha esperam o produtor.
  const [autoRetried, setAutoRetried] = useState<ReadonlySet<string>>(() => new Set());
  const autoRetryId =
    detail.messages.find(
      (m) =>
        m.author === "buyer" &&
        m.interpretation.status === "failed" &&
        (m.interpretation.error === "provider_error" || m.interpretation.error === "timeout") &&
        !autoRetried.has(m.id),
    )?.id ?? null;
  useEffect(() => {
    if (!autoRetryId || retrying) return;
    const timer = setTimeout(() => {
      setAutoRetried((done) => new Set(done).add(autoRetryId));
      void retryInterpretation(autoRetryId);
    }, AUTO_RETRY_MS);
    return () => clearTimeout(timer);
    // retryInterpretation lê o estado atual; o efeito só depende da entrada alvo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRetryId, retrying]);

  const applySuggestion = (text: string) => {
    setBody(text);
    setNotice(null);
    requestAnimationFrame(() => editor.current?.focus());
  };

  const product = detail.product;
  const versionNote =
    product.currentVersion === null
      ? "Produto retirado da vitrine. A conversa continua com os dados da versão consultada."
      : product.currentVersion !== product.version
        ? `A vitrine está na versão ${product.currentVersion}; esta conversa usa a versão ${product.version}, que o comprador consultou.`
        : null;
  // A sugestão responde à última entrada; depois de respondida, deixa de aparecer.
  const suggestion = detail.awaitingReply ? (latestBuyer?.analysis?.suggestedReply ?? null) : null;
  const target = langName(detail.replyLang);

  return (
    <div className="min-w-0">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="min-w-0">
          <Link href="/meu-espaco/mensagens" className="mb-1 inline-flex min-h-10 items-center text-sm text-mist hover:text-snow lg:hidden">
            ← Conversas
          </Link>
          <h1 className="truncate text-lg font-semibold text-snow">
            <span lang={product.titleLang}>{product.title}</span>
            <span className="ml-2 text-sm font-normal text-mist">{product.originalName}</span>
          </h1>
          <p className="mt-0.5 text-sm text-mist">
            {buyerLabel(detail.buyer)} · versão {product.version}
            {product.price && ` · ${formatBrl(product.price.brlCents)} (${formatCny(product.price.cnyFen)})`}
          </p>
          {versionNote && <p className="mt-1 text-xs text-warn">{versionNote}</p>}
        </div>
        <ConversationStatus item={detail} />
      </header>

      <div className="mt-4 xl:grid xl:grid-cols-[minmax(0,1fr)_15rem] xl:gap-6">
        {latestBuyer && (
          <div className="mb-4 xl:col-start-2 xl:row-start-1 xl:mb-0">
            <div className="xl:sticky xl:top-4">
              <Copilot
                message={latestBuyer}
                version={product.version}
                answered={!detail.awaitingReply}
                busy={retrying}
                onRetry={retryInterpretation}
              />
            </div>
          </div>
        )}

        <div className="mx-auto flex w-full max-w-3xl flex-col xl:col-start-1 xl:row-start-1">
          <section aria-labelledby="thread-heading">
            <h2 id="thread-heading" ref={threadHeading} tabIndex={-1} className="sr-only">
              Mensagens da conversa
            </h2>
            <ol className="space-y-3" aria-live="polite" aria-relevant="additions">
              {detail.messages.map((m) => (
                <MessageItem
                  key={m.id}
                  message={m}
                  busy={retrying}
                  onRetry={retryInterpretation}
                  unread={m.author === "buyer" && m.seq > detail.readSeq}
                />
              ))}
              <li ref={threadEnd} aria-hidden="true" />
            </ol>
          </section>

          <section
            aria-labelledby="reply-heading"
            className="mt-4 border-t border-line pb-4 pt-3"
          >
            <h2 id="reply-heading" className="sr-only">
              Sua resposta
            </h2>

            {suggestion && trimmed !== suggestion && (
              <div className="mb-3 rounded-lg border border-line/80 bg-panel/60 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                  <div className="min-w-0 flex-1 basis-64">
                    <p className="text-xs font-semibold text-coral">Sugestão do copiloto</p>
                    <p lang="pt-BR" className="mt-0.5 text-snow/85">
                      {suggestion}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => applySuggestion(suggestion)}
                    aria-describedby="suggestion-note"
                    className="inline-flex min-h-9 shrink-0 items-center rounded-md border border-coral/70 px-3 text-xs font-semibold text-coral hover:bg-coral/10"
                  >
                    Usar resposta sugerida
                  </button>
                </div>
                <p id="suggestion-note" className="mt-1 text-xs text-mist">
                  Usar só copia o texto para o editor, onde você ajusta. Nada é enviado ao comprador.
                </p>
              </div>
            )}

            <label htmlFor="reply-body" className="mb-1 flex items-baseline gap-2 text-sm font-medium text-snow">
              <StepNumber n={1} /> Sua resposta em português
            </label>
            <textarea
              id="reply-body"
              ref={editor}
              lang="pt-BR"
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                if (notice?.tone === "ok") setNotice(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void confirmSend();
                }
              }}
              rows={3}
              maxLength={LIMITS.body}
              disabled={sending}
              placeholder="Escreva sua resposta em português…"
              aria-describedby="reply-preview"
              className="block w-full resize-y rounded-lg border border-line bg-panel px-3 py-2.5 leading-relaxed text-snow placeholder:text-mist/70"
            />

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-baseline gap-2 text-sm font-medium text-snow">
                <StepNumber n={2} /> Revisar tradução
              </h3>
              <button
                type="button"
                onClick={() => {
                  if (!ready) void translate(trimmed);
                  requestAnimationFrame(() => previewRef.current?.focus());
                }}
                disabled={!trimmed || translating || sending || Boolean(ready)}
                className="inline-flex min-h-9 items-center rounded-md border border-line px-3 text-xs font-semibold text-snow hover:border-coral disabled:cursor-not-allowed disabled:opacity-50"
              >
                {translating ? "Traduzindo…" : ready ? "Tradução em dia" : "Revisar tradução"}
              </button>
            </div>
            <div id="reply-preview" ref={previewRef} tabIndex={-1} className="mt-1 outline-none" aria-live="polite">
              {!trimmed ? (
                <p className="text-xs text-mist">A tradução para {target} aparece aqui enquanto você escreve.</p>
              ) : ready ? (
                <div className="rounded-lg border border-coral/30 bg-ivory/95 px-3 py-2">
                  <p className="text-xs text-ink-soft">
                    Confira números, unidades e negativas. É exatamente isto que o comprador vai receber ({target})
                    {ready.isTestAdapter && " · resposta de teste (AI_MODE=test)"}:
                  </p>
                  <p lang={ready.lang} className="mt-0.5 whitespace-pre-line leading-relaxed text-ink">
                    {ready.text}
                  </p>
                  {ready.warnings.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-xs text-brand">
                      {ready.warnings.map((w) => (
                        <li key={w}>⚠ {w}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : failedFor === trimmed ? (
                <p className="flex flex-wrap items-center gap-2 text-sm text-coral" role="alert">
                  A tradução falhou. Seu texto está salvo.
                  <button
                    type="button"
                    onClick={() => void translate(trimmed)}
                    className="inline-flex min-h-9 items-center rounded-md border border-coral px-3 text-xs font-semibold"
                  >
                    Tentar novamente
                  </button>
                </p>
              ) : (
                <p className="text-xs text-mist" role="status">
                  {translating ? `Traduzindo para ${target}…` : `A tradução para ${target} será atualizada quando você parar de digitar.`}
                </p>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line/60 pt-3">
              <div className="min-w-0 flex-1 basis-64">
                <p className="flex items-baseline gap-2 text-sm font-medium text-snow">
                  <StepNumber n={3} /> Confirmar envio
                </p>
                <p role="status" className="mt-0.5 min-h-5 text-xs">
                  {notice ? (
                    <span className={notice.tone === "error" ? "text-coral" : "text-ok"}>{notice.text}</span>
                  ) : ready ? (
                    <span className="text-mist">Envia ao comprador a tradução acima, uma única vez (Ctrl + Enter).</span>
                  ) : (
                    <span className="text-mist">Fica disponível quando a tradução do texto atual aparecer. Antes disso, nada chega ao comprador.</span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void confirmSend()}
                disabled={!ready || sending}
                title="Ctrl + Enter"
                className="inline-flex min-h-11 items-center rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? "Enviando…" : "Confirmar envio"}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function MessageItem({
  message,
  busy,
  unread,
  onRetry,
}: {
  message: ProducerMessageView;
  busy: boolean;
  unread: boolean;
  onRetry: (id: string) => void;
}) {
  if (message.author === "producer") {
    return (
      <li id={`pmsg-${message.id}`} className="ml-auto max-w-[85%] scroll-mt-4 rounded-2xl rounded-br-sm bg-panel-2 px-4 py-3">
        <p className="text-xs text-mist">
          Você · {timeFormat.format(new Date(message.createdAt))} · enviada em {langName(message.translation.lang)}
        </p>
        <p lang="pt-BR" className="mt-1 whitespace-pre-line break-words text-snow">
          {message.textPt}
        </p>
        <details className="mt-1 text-xs text-mist">
          <summary className="cursor-pointer">Ver o que o comprador recebeu</summary>
          <p lang={message.translation.lang} className="mt-1 whitespace-pre-line text-sm text-snow/90">
            {message.translation.text}
          </p>
        </details>
      </li>
    );
  }

  const { interpretation } = message;
  const originalLang = message.original.lang === "en" ? "en" : "zh-Hans";
  return (
    <li id={`pmsg-${message.id}`} className="mr-auto max-w-[85%] scroll-mt-4 rounded-2xl rounded-bl-sm border border-line bg-panel px-4 py-3">
      <p className="flex flex-wrap items-center gap-2 text-xs text-mist">
        <span>Comprador · {timeFormat.format(new Date(message.createdAt))}</span>
        {unread && <span className="font-semibold text-coral">Nova</span>}
      </p>
      {message.translationPt ? (
        <>
          <p lang="pt-BR" className="mt-1 whitespace-pre-line break-words text-snow">
            {message.translationPt}
          </p>
          <details className="mt-1 text-xs text-mist">
            <summary className="cursor-pointer">
              Ver original ({langName(message.original.lang)})
              {interpretation.isTestAdapter && " · tradução de teste"}
            </summary>
            <p lang={originalLang} className="mt-1 whitespace-pre-line text-sm text-snow/90">
              {message.original.text}
            </p>
          </details>
        </>
      ) : (
        <>
          <p lang={originalLang} className="mt-1 whitespace-pre-line break-words text-snow/90">
            {message.original.text}
          </p>
          {interpretation.status === "failed" ? (
            <p className="mt-1 text-xs text-coral" role="alert">
              Não foi possível traduzir. {AI_ERROR_MESSAGES[interpretation.error ?? ""] ?? ""} O original está salvo.
            </p>
          ) : (
            <p className="mt-1 text-xs text-mist" role="status">
              Traduzindo…
            </p>
          )}
          {interpretation.retryable && (
            <button
              type="button"
              onClick={() => onRetry(message.id)}
              disabled={busy}
              className="mt-2 inline-flex min-h-9 items-center rounded-md border border-coral px-3 text-xs font-semibold text-coral disabled:opacity-60"
            >
              Tentar novamente
            </button>
          )}
        </>
      )}
    </li>
  );
}

/** Copiloto discreto: síntese, pendências em etiquetas e análise recolhida. */
function Copilot({
  message,
  version,
  answered,
  busy,
  onRetry,
}: {
  message: BuyerMessage;
  version: number;
  /** A última consulta já recebeu resposta: as pendências viram registro. */
  answered: boolean;
  busy: boolean;
  onRetry: (id: string) => void;
}) {
  const analysis = message.analysis;
  return (
    <aside aria-labelledby="copilot-heading" className="rounded-xl border border-line/70 bg-panel/40 p-3 text-sm">
      <h2 id="copilot-heading" className="text-xs font-semibold uppercase tracking-wide text-coral">
        Copiloto
      </h2>
      {!analysis ? (
        <p className="mt-1 text-xs text-mist">
          {message.interpretation.status === "failed"
            ? "A análise da última mensagem falhou."
            : "A análise aparece aqui quando a tradução terminar."}
          {message.interpretation.retryable && (
            <button type="button" onClick={() => onRetry(message.id)} disabled={busy} className="ml-1 text-coral underline">
              Tentar novamente
            </button>
          )}
        </p>
      ) : (
        <>
          <p className="mt-1 text-snow/90">{analysis.summary}</p>
          {analysis.pending.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-warn">{answered ? "Pontos da última consulta (já respondida):" : "Confirme antes de responder:"}</p>
              <ul className="mt-1 flex flex-wrap gap-1" aria-label="Pendências">
                {analysis.pending.map((p) => (
                  <li key={p.topic} title={p.note} className="text-xs text-warn">
                    {p.label}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-mist">Ver análise</summary>
            <dl className="mt-2 space-y-2 text-snow/90">
              <div>
                <dt className="text-mist">O que foi pedido</dt>
                <dd>
                  {analysis.intents.join(", ")}
                  {analysis.quantities.length > 0 &&
                    ` · ${analysis.quantities.map((q) => `${q.value.toLocaleString("pt-BR")} ${q.unit}`).join(", ")}`}
                </dd>
              </div>
              {analysis.pending.length > 0 && (
                <div>
                  <dt className="text-mist">O que falta</dt>
                  <dd>
                    <ul className="space-y-0.5">
                      {analysis.pending.map((p) => (
                        <li key={p.topic}>
                          {p.label}: {p.note}
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-mist">Dados da ficha (versão {version})</dt>
                <dd>
                  {analysis.facts.length === 0 ? (
                    "A ficha não responde diretamente a esta pergunta."
                  ) : (
                    <ul className="space-y-0.5">
                      {analysis.facts.map((f) => (
                        <li key={f.key}>
                          {f.label}: {f.value}
                        </li>
                      ))}
                    </ul>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-mist">Próximo passo</dt>
                <dd>{analysis.nextStep}</dd>
              </div>
              {analysis.culturalNote && (
                <div>
                  <dt className="text-mist">Nota cultural</dt>
                  <dd>{analysis.culturalNote}</dd>
                </div>
              )}
            </dl>
          </details>
        </>
      )}
    </aside>
  );
}

/** Número do passo da resposta: escrever, revisar a tradução, confirmar o envio. */
function StepNumber({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-coral/60 text-[0.7rem] font-semibold text-coral"
    >
      {n}
    </span>
  );
}
