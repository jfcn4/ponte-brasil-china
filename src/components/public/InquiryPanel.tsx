"use client";

import { useEffect, useId, useRef, useState } from "react";
import { fetchJson, safeStorage } from "@/lib/client/fetch-json";
import { LIMITS } from "@/modules/messaging/schema";
import { generateSessionToken } from "@/modules/stores/token";
import { InquiryLabel } from "./ProductShowcase";

type Pending = { token: string; clientKey: string; message: string; name: string; company: string };

/** Conversas que este navegador iniciou, por vitrine (só conveniência local). */
export const KNOWN_CONVERSATIONS_KEY = "pg_buyer_conversations";
const pendingKey = (slug: string) => `pg_inquiry_pending:${slug}`;

export function conversationHref(token: string) {
  return `/conversa#t=${token}`;
}

/**
 * “询价 · Solicitar cotação” na vitrine. Só a mensagem é obrigatória; nome e
 * empresa são opcionais. O segredo do link privado é gerado aqui e guardado
 * até a confirmação do servidor, de modo que repetir o envio após uma falha
 * de rede não cria outra conversa.
 */
export function InquiryPanel({ slug, version }: { slug: string; version: number }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{ code: string | null; text: string } | null>(null);
  const [previous, setPrevious] = useState<string | null>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  /** O bloco de cotação ainda está abaixo da tela: mostra o atalho fixo no rodapé. */
  const [below, setBelow] = useState(false);
  const formId = useId();

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) setBelow(!entry.isIntersecting && entry.boundingClientRect.top > 0);
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  /** Atalho do rodapé: leva ao bloco de cotação e abre o formulário. */
  const jumpToInquiry = () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    rootRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    if (open) messageRef.current?.focus({ preventScroll: true });
    else setOpen(true);
  };

  useEffect(() => {
    const known = safeStorage.get<Record<string, string>>("local", KNOWN_CONVERSATIONS_KEY);
    const pending = safeStorage.get<Pending>("session", pendingKey(slug));
    // Leitura única do armazenamento local após a hidratação.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (known?.[slug]) setPrevious(known[slug]);
    if (pending) {
      setOpen(true);
      setMessage(pending.message);
      setName(pending.name);
      setCompany(pending.company);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [slug]);

  useEffect(() => {
    if (open) messageRef.current?.focus({ preventScroll: true });
    if (open) rootRef.current?.scrollIntoView({ block: "nearest" });
  }, [open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (sending) return;
    const text = message.trim();
    if (!text) {
      setError({ code: "empty", text: "请填写留言内容。" });
      messageRef.current?.focus();
      return;
    }
    // Mesmo segredo e mesma chave em cada repetição deste envio.
    const stored = safeStorage.get<Pending>("session", pendingKey(slug));
    const pending: Pending = {
      token: stored?.token ?? generateSessionToken(),
      clientKey: stored?.clientKey ?? crypto.randomUUID(),
      message,
      name,
      company,
    };
    safeStorage.set("session", pendingKey(slug), pending);
    setSending(true);
    setError(null);

    const result = await fetchJson<{ ok: true }>(
      "/api/inquiries",
      {
        method: "POST",
        json: {
          slug,
          version,
          token: pending.token,
          clientKey: pending.clientKey,
          message: text,
          name: name.trim() || null,
          company: company.trim() || null,
        },
      },
      "网络连接失败。您的留言已保留，请检查网络后重试。",
    );

    if (result.ok) {
      safeStorage.remove("session", pendingKey(slug));
      const known = safeStorage.get<Record<string, string>>("local", KNOWN_CONVERSATIONS_KEY) ?? {};
      safeStorage.set("local", KNOWN_CONVERSATIONS_KEY, { ...known, [slug]: pending.token });
      window.location.assign(conversationHref(pending.token));
      return;
    }
    setSending(false);
    if (result.code === "token_conflict") safeStorage.remove("session", pendingKey(slug));
    setError({ code: result.code, text: result.message });
  };

  return (
    <div ref={rootRef} className="scroll-mt-24">
      {open ? form() : closed()}
      {below && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-sand bg-ivory/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur print:hidden">
          <button
            type="button"
            onClick={jumpToInquiry}
            className="mx-auto flex min-h-12 w-full max-w-3xl items-center justify-center gap-2 rounded-xl bg-brand text-lg font-semibold text-white shadow-lg hover:bg-brand-strong"
          >
            <InquiryLabel />
          </button>
        </div>
      )}
    </div>
  );

  function closed() {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          aria-controls={formId}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand text-lg font-semibold text-white hover:bg-brand-strong"
        >
          <InquiryLabel />
        </button>
        {previous && (
          <p className="text-center text-sm">
            <a href={conversationHref(previous)} className="font-medium text-brand underline underline-offset-4">
              继续之前的对话
            </a>
          </p>
        )}
      </div>
    );
  }

  function form() {
    return (
      <form id={formId} onSubmit={submit} noValidate className="space-y-4" aria-labelledby={`${formId}-title`}>
        <div>
          <h3 id={`${formId}-title`} className="text-lg font-semibold text-ink">
            询价 <span lang="pt-BR" className="text-sm font-medium text-ink-soft">· Solicitar cotação</span>
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            无需注册。发送后将获得私密链接，可随时返回本对话。
          </p>
        </div>

        <div>
          <label htmlFor={`${formId}-message`} className="block text-sm font-medium text-ink">
            留言 <span className="text-brand">（必填）</span>
          </label>
          <textarea
            id={`${formId}-message`}
            ref={messageRef}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              if (error?.code === "empty") setError(null);
            }}
            maxLength={LIMITS.body}
            rows={4}
            required
            aria-invalid={error?.code === "empty" || undefined}
            aria-describedby={error ? `${formId}-error` : `${formId}-hint`}
            placeholder="例如：请问可以供应多少瓶？能否送到上海？"
            className="mt-1 block w-full rounded-xl border border-sand bg-white px-3 py-2.5 text-base leading-relaxed text-ink placeholder:text-ink-soft/70"
          />
          <p id={`${formId}-hint`} className="mt-1 text-xs text-ink-soft">
            可使用中文或英文。
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${formId}-name`} className="block text-sm font-medium text-ink">
              姓名（选填）
            </label>
            <input
              id={`${formId}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={LIMITS.buyerName}
              autoComplete="name"
              className="mt-1 block w-full rounded-xl border border-sand bg-white px-3 py-2.5 text-base text-ink"
            />
          </div>
          <div>
            <label htmlFor={`${formId}-company`} className="block text-sm font-medium text-ink">
              公司（选填）
            </label>
            <input
              id={`${formId}-company`}
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              maxLength={LIMITS.buyerCompany}
              autoComplete="organization"
              className="mt-1 block w-full rounded-xl border border-sand bg-white px-3 py-2.5 text-base text-ink"
            />
          </div>
        </div>

        {error && (
          <div id={`${formId}-error`} role="alert" className="rounded-xl border border-brand/30 bg-brand/5 px-3 py-2.5 text-sm text-ink">
            <p>{error.text}</p>
            {error.code === "version_changed" && (
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-2 inline-flex min-h-10 items-center rounded-lg border border-brand px-3 font-medium text-brand"
              >
                查看最新产品信息
              </button>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="submit"
            disabled={sending}
            className="flex min-h-12 flex-1 items-center justify-center rounded-xl bg-brand text-lg font-semibold text-white hover:bg-brand-strong disabled:cursor-wait disabled:opacity-80"
          >
            {sending ? "正在发送…" : "发送询价"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={sending}
            className="flex min-h-12 items-center justify-center rounded-xl border border-sand px-5 font-medium text-ink-soft"
          >
            收起
          </button>
        </div>
      </form>
    );
  }
}
