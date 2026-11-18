"use client";

import Link from "next/link";
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
import { ConversationBadges } from "./ConversationList";

const POLL_MS = 8_000;
const OFFLINE = "Sem conexão com o servidor. Seu texto continua aqui; tente novamente quando a conexão voltar.";

const timeFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

type Phase = "idle" | "saving" | "translating" | "sending" | "interpreting";
type Notice = { tone: "error" | "ok" | "info"; text: string } | null;

function langName(lang: string) {
  return LANG_LABELS[lang] ?? "outro idioma";
}

function lastBuyerMessage(detail: ConversationDetail) {
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
 * Conversa no painel do produtor: tradução em português com acesso ao
 * original, copiloto discreto, resposta em português, revisão da tradução e
 * confirmação explícita do envio. A sugestão só preenche o editor.
 */
export function ConversationView({ initial }: { initial: ConversationDetail }) {
  const [detail, setDetail] = useState(initial);
  const [body, setBody] = useState(initial.draft?.body ?? "");
  const [phase, setPhase] = useState<Phase>("idle");
  const [notice, setNotice] = useState<Notice>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const threadHeading = useRef<HTMLHeadingElement>(null);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const phaseRef = useRef<Phase>("idle");
  const detailRef = useRef(detail);
  useEffect(() => {
    detailRef.current = detail;
  }, [detail]);

  const setBusy = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const refresh = useCallback(async () => {
    const result = await fetchJson<{ conversation: ConversationDetail }>(`/api/conversations/${initial.id}`);
    if (result.ok) setDetail(result.data.conversation);
    return result.ok ? result.data.conversation : null;
  }, [initial.id]);

  // Atualização periódica (novas entradas, interpretação concluída).
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && phaseRef.current === "idle") void refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  // Marca como lidas só as entradas que esta tela exibiu.
  const lastShownBuyerSeq = lastBuyerMessage(detail)?.seq ?? 0;
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

  const draft = detail.draft;
  const trimmed = body.trim();
  const translation = draft?.translation;
  // A prévia vale só para o texto exato que foi traduzido.
  const previewMatches = Boolean(draft && translation?.status === "ready" && draft.body === trimmed);
  const editedAfterPreview = Boolean(draft && translation?.status === "ready" && draft.body !== trimmed);

  const applyDraft = (next: DraftView | null) => setDetail((current) => ({ ...current, draft: next }));

  /** Guarda o texto ao sair do editor (preserva o rascunho se a página fechar). */
  const saveOnBlur = async (event: React.FocusEvent<HTMLTextAreaElement>) => {
    // Indo para "Revisar tradução": essa ação já grava o texto.
    if ((event.relatedTarget as HTMLElement | null)?.dataset.composerAction) return;
    if (phaseRef.current !== "idle" || !trimmed || trimmed === detailRef.current.draft?.body) return;
    setBusy("saving");
    const result = await fetchJson<{ draft: DraftView }>(`/api/conversations/${detail.id}/draft`, {
      method: "PUT",
      json: { expectedRevision: detailRef.current.draft?.revision ?? null, body: trimmed },
    });
    setBusy("idle");
    if (result.ok) {
      setDetail((current) =>
        result.data.draft.revision > (current.draft?.revision ?? 0) ? { ...current, draft: result.data.draft } : current,
      );
    } else if (result.code === "revision_conflict") await refresh();
  };

  const reviewTranslation = async () => {
    if (phaseRef.current !== "idle" && phaseRef.current !== "saving") return;
    if (!trimmed) {
      setNotice({ tone: "error", text: "Escreva a resposta em português antes de revisar a tradução." });
      editor.current?.focus();
      return;
    }
    setBusy("translating");
    setNotice(null);
    const result = await fetchJson<{ draft: DraftView }>(
      `/api/conversations/${detail.id}/draft/translation`,
      { method: "POST", json: { expectedRevision: detailRef.current.draft?.revision ?? null, body: trimmed } },
      OFFLINE,
    );
    setBusy("idle");
    if (result.ok) {
      applyDraft(result.data.draft);
      requestAnimationFrame(() => previewHeading.current?.focus());
      return;
    }
    if (result.data && "draft" in result.data && result.data.draft) applyDraft(result.data.draft);
    if (result.code === "revision_conflict") await refresh();
    setNotice({ tone: "error", text: result.message });
  };

  const confirmSend = async () => {
    if (phaseRef.current !== "idle" || !draft || !previewMatches) return;
    setBusy("sending");
    setNotice(null);
    // Mesmo rascunho e revisão em cada repetição: o servidor não duplica o envio.
    const result = await fetchJson<{ conversation: ConversationDetail; sent: { created: boolean } }>(
      `/api/conversations/${detail.id}/replies`,
      { method: "POST", json: { draftId: draft.id, expectedRevision: draft.revision, confirmed: true } },
      "Não foi possível confirmar o envio (sem conexão). Toque em “Confirmar envio” de novo: a resposta não será duplicada.",
    );
    setBusy("idle");
    if (result.ok) {
      setDetail(result.data.conversation);
      setBody("");
      setNotice({ tone: "ok", text: `Resposta enviada ao comprador em ${langName(draft.translation.status === "ready" ? draft.translation.lang : detail.replyLang)}.` });
      announceChange();
      requestAnimationFrame(() => threadHeading.current?.focus());
      return;
    }
    if (result.code === "translation_stale" || result.code === "revision_conflict") await refresh();
    setNotice({ tone: "error", text: result.message });
  };

  const retryInterpretation = async (messageId: string) => {
    if (phaseRef.current !== "idle") return;
    setBusy("interpreting");
    setNotice(null);
    const result = await fetchJson<{ conversation: ConversationDetail; outcome: string }>(
      `/api/conversations/${detail.id}/messages/${messageId}/interpretation`,
      { method: "POST" },
      OFFLINE,
    );
    setBusy("idle");
    if (result.data && "conversation" in result.data && result.data.conversation) setDetail(result.data.conversation);
    if (!result.ok) setNotice({ tone: "error", text: result.status === 502 ? "A tradução falhou de novo. A mensagem original continua salva." : result.message });
  };

  const useSuggestion = (text: string) => {
    setBody(text);
    setNotice({ tone: "info", text: "Sugestão copiada para o editor. Ajuste o texto e revise a tradução antes de enviar." });
    requestAnimationFrame(() => editor.current?.focus());
  };

  const latestBuyer = lastBuyerMessage(detail);
  const product = detail.product;
  const versionNote =
    product.currentVersion === null
      ? "Produto retirado da vitrine. A conversa continua com os dados da versão consultada."
      : product.currentVersion !== product.version
        ? `A vitrine está na versão ${product.currentVersion}. Esta conversa usa os dados da versão ${product.version}, que o comprador consultou.`
        : null;

  return (
    <div className="space-y-5">
      <header className="rounded-xl border border-line bg-panel p-4">
        <Link href="/meu-espaco/mensagens" className="mb-2 inline-flex min-h-10 items-center text-sm text-mist hover:text-snow lg:hidden">
          ← Conversas
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-snow">
              <span lang={product.titleLang}>{product.title}</span>
              <span className="ml-2 text-base font-normal text-mist">{product.originalName}</span>
            </h1>
            <p className="mt-1 text-sm text-mist">
              {buyerLabel(detail.buyer)} · versão {product.version} consultada
              {product.price && ` · ${formatBrl(product.price.brlCents)} (${formatCny(product.price.cnyFen)} na vitrine)`}
            </p>
          </div>
          <ConversationBadges item={detail} />
        </div>
        {versionNote && <p className="mt-2 rounded-lg bg-panel-2 px-3 py-2 text-sm text-snow/90">{versionNote}</p>}
      </header>

      <section aria-labelledby="thread-heading">
        <h2 id="thread-heading" ref={threadHeading} tabIndex={-1} className="sr-only">
          Mensagens da conversa
        </h2>
        <ol className="space-y-3" aria-live="polite" aria-relevant="additions">
          {detail.messages.map((m) => (
            <MessageItem
              key={m.id}
              message={m}
              busy={phase !== "idle"}
              onRetry={retryInterpretation}
              unread={m.author === "buyer" && m.seq > detail.readSeq}
            />
          ))}
        </ol>
      </section>

      {latestBuyer && (
        <Copilot
          message={latestBuyer}
          version={product.version}
          busy={phase !== "idle"}
          onUse={useSuggestion}
          onRetry={retryInterpretation}
        />
      )}

      <section aria-labelledby="reply-heading" className="rounded-xl border border-line bg-panel p-4">
        <h2 id="reply-heading" className="font-semibold text-snow">
          Sua resposta
        </h2>
        <p className="mt-1 text-sm text-mist">
          Escreva em português. O comprador recebe a tradução em {langName(detail.replyLang)} somente depois que você revisar e
          confirmar o envio.
        </p>
        <label htmlFor="reply-body" className="mt-3 block text-sm font-medium text-snow">
          Texto em português
        </label>
        <textarea
          id="reply-body"
          ref={editor}
          lang="pt-BR"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onBlur={(event) => void saveOnBlur(event)}
          rows={5}
          maxLength={LIMITS.body}
          disabled={phase === "sending"}
          className="mt-1 block w-full rounded-lg border border-line bg-night px-3 py-2.5 leading-relaxed text-snow"
        />

        {editedAfterPreview && (
          <p className="mt-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn" role="status">
            Você alterou o texto depois da revisão. A tradução anterior foi descartada: revise a tradução novamente antes de
            enviar.
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            data-composer-action="review"
            onClick={() => void reviewTranslation()}
            disabled={(phase !== "idle" && phase !== "saving") || previewMatches}
            className={`inline-flex min-h-11 items-center rounded-lg px-5 font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${
              previewMatches ? "border border-line text-mist" : "bg-brand text-white hover:bg-brand-strong"
            }`}
          >
            {phase === "translating"
              ? "Traduzindo…"
              : translation?.status === "failed" && draft?.body === trimmed
                ? "Tentar novamente"
                : previewMatches
                  ? "Tradução revisada"
                  : "Revisar tradução"}
          </button>
          {phase === "saving" && <span className="self-center text-sm text-mist">Salvando rascunho…</span>}
        </div>

        {draft && previewMatches && translation?.status === "ready" && (
          <div className="mt-4 rounded-xl border border-coral/40 bg-night p-4">
            <h3 ref={previewHeading} tabIndex={-1} className="text-sm font-semibold text-snow">
              Prévia do que o comprador vai receber ({langName(translation.lang)})
            </h3>
            {translation.isTestAdapter && (
              <p className="mt-1 text-xs text-warn">Resposta de teste (AI_MODE=test): não é uma tradução real.</p>
            )}
            <p lang={translation.lang} className="mt-2 whitespace-pre-line rounded-lg bg-ivory px-3 py-3 leading-relaxed text-ink">
              {translation.text}
            </p>
            {translation.warnings.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm text-warn">
                {translation.warnings.map((w) => (
                  <li key={w}>⚠ {w}</li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-mist">
              Confira quantidades, unidades, negativas e condições. Se quiser mudar algo, edite o texto em português e revise
              de novo.
            </p>
            <button
              type="button"
              onClick={() => void confirmSend()}
              disabled={phase !== "idle"}
              className="mt-3 inline-flex min-h-12 items-center rounded-lg bg-brand px-6 font-semibold text-white hover:bg-brand-strong disabled:cursor-wait disabled:opacity-70"
            >
              {phase === "sending" ? "Enviando…" : "Confirmar envio"}
            </button>
          </div>
        )}

        <div role="status" aria-live="polite" className="mt-3 min-h-5 text-sm">
          {phase === "translating" && <span className="text-mist">Traduzindo sua resposta. O texto em português já foi salvo.</span>}
          {notice && phase === "idle" && (
            <span className={notice.tone === "error" ? "text-coral" : notice.tone === "ok" ? "text-ok" : "text-mist"}>
              {notice.text}
            </span>
          )}
        </div>
      </section>
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
      <li className="ml-auto max-w-[90%] rounded-xl rounded-br-sm border border-line bg-panel-2 p-3 sm:max-w-[80%]">
        <p className="text-xs text-mist">
          Você · {timeFormat.format(new Date(message.createdAt))} · enviada em {langName(message.translation.lang)}
        </p>
        <p lang="pt-BR" className="mt-1 whitespace-pre-line break-words text-snow">
          {message.textPt}
        </p>
        <details className="mt-2 text-sm text-mist">
          <summary className="cursor-pointer">Ver o que o comprador recebeu</summary>
          <p lang={message.translation.lang} className="mt-1 whitespace-pre-line text-snow/90">
            {message.translation.text}
          </p>
        </details>
      </li>
    );
  }

  const { interpretation } = message;
  return (
    <li className="mr-auto max-w-[90%] rounded-xl rounded-bl-sm border border-line bg-panel p-3 sm:max-w-[80%]">
      <p className="flex flex-wrap items-center gap-2 text-xs text-mist">
        <span>Comprador · {timeFormat.format(new Date(message.createdAt))}</span>
        {unread && <span className="rounded-full bg-coral/15 px-2 font-semibold text-coral">Nova</span>}
      </p>
      {message.translationPt ? (
        <>
          <p lang="pt-BR" className="mt-1 whitespace-pre-line break-words text-snow">
            {message.translationPt}
          </p>
          <p className="mt-1 text-xs text-mist">
            Tradução automática do {langName(message.original.lang)}
            {interpretation.isTestAdapter && " · resposta de teste (AI_MODE=test)"}
          </p>
          <details className="mt-2 text-sm text-mist">
            <summary className="cursor-pointer">Ver original</summary>
            <p lang={message.original.lang === "en" ? "en" : "zh-Hans"} className="mt-1 whitespace-pre-line text-snow/90">
              {message.original.text}
            </p>
          </details>
        </>
      ) : (
        <>
          <p lang={message.original.lang === "en" ? "en" : "zh-Hans"} className="mt-1 whitespace-pre-line break-words text-snow/90">
            {message.original.text}
          </p>
          {interpretation.status === "failed" ? (
            <div className="mt-2 rounded-lg border border-coral/40 bg-coral/10 px-3 py-2 text-sm text-snow" role="alert">
              <p>
                Não foi possível traduzir esta mensagem. {AI_ERROR_MESSAGES[interpretation.error ?? ""] ?? ""} O original acima
                está salvo.
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-mist" role="status">
              Traduzindo e analisando a mensagem…
            </p>
          )}
          {interpretation.retryable && (
            <button
              type="button"
              onClick={() => onRetry(message.id)}
              disabled={busy}
              className="mt-2 inline-flex min-h-10 items-center rounded-lg border border-coral px-3 text-sm font-medium text-coral disabled:opacity-60"
            >
              Tentar novamente
            </button>
          )}
        </>
      )}
    </li>
  );
}

function Copilot({
  message,
  version,
  busy,
  onUse,
  onRetry,
}: {
  message: Extract<ProducerMessageView, { author: "buyer" }>;
  version: number;
  busy: boolean;
  onUse: (text: string) => void;
  onRetry: (id: string) => void;
}) {
  const analysis = message.analysis;
  return (
    <section aria-labelledby="copilot-heading" className="rounded-xl border border-line bg-panel/60 p-4">
      <h2 id="copilot-heading" className="text-sm font-semibold text-coral">
        Copiloto
      </h2>
      {!analysis ? (
        <p className="mt-1 text-sm text-mist">
          {message.interpretation.status === "failed"
            ? "A análise da última mensagem falhou. Use “Tentar novamente” na mensagem ou escreva sua resposta do zero."
            : "A análise aparece aqui assim que a tradução terminar."}
          {message.interpretation.retryable && message.interpretation.status !== "failed" && (
            <button type="button" onClick={() => onRetry(message.id)} disabled={busy} className="ml-2 text-coral underline">
              Tentar novamente
            </button>
          )}
        </p>
      ) : (
        <>
          <p className="mt-1 text-snow">{analysis.summary}</p>
          {analysis.pending.length > 0 && (
            <div className="mt-3 rounded-lg border border-warn/40 bg-warn/10 p-3">
              <p className="text-sm font-semibold text-warn">Antes de responder, confirme:</p>
              <ul className="mt-1 space-y-1 text-sm text-snow">
                {analysis.pending.map((p) => (
                  <li key={p.topic}>
                    <strong className="font-semibold">{p.label}:</strong> {p.note}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-3 rounded-lg bg-night p-3">
            <p className="text-xs text-mist">Resposta sugerida</p>
            <p lang="pt-BR" className="mt-1 text-snow">
              {analysis.suggestedReply}
            </p>
            <button
              type="button"
              onClick={() => onUse(analysis.suggestedReply)}
              className="mt-2 inline-flex min-h-10 items-center rounded-lg border border-coral px-3 text-sm font-medium text-coral hover:bg-coral/10"
            >
              Usar resposta sugerida
            </button>
          </div>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-mist">Ver análise completa</summary>
            <dl className="mt-2 space-y-3 text-snow">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-mist">O que foi pedido</dt>
                <dd className="mt-0.5">
                  {analysis.intents.join(", ")}
                  {analysis.quantities.length > 0 &&
                    ` · ${analysis.quantities.map((q) => `${q.value.toLocaleString("pt-BR")} ${q.unit}`).join(", ")}`}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-mist">Dados da ficha (versão {version})</dt>
                <dd className="mt-0.5">
                  {analysis.facts.length === 0 ? (
                    "A ficha publicada não responde diretamente a esta pergunta."
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
                <dt className="text-xs font-semibold uppercase tracking-wide text-mist">O que falta</dt>
                <dd className="mt-0.5">
                  {analysis.pending.length === 0 ? "Nada pendente identificado." : analysis.pending.map((p) => p.label).join(", ")}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-mist">Próximo passo</dt>
                <dd className="mt-0.5">{analysis.nextStep}</dd>
              </div>
              {analysis.culturalNote && (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-mist">Nota cultural</dt>
                  <dd className="mt-0.5">{analysis.culturalNote}</dd>
                </div>
              )}
            </dl>
          </details>
        </>
      )}
    </section>
  );
}
