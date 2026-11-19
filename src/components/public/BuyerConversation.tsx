"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson, safeStorage } from "@/lib/client/fetch-json";
import { BUYER_TOKEN_HEADER, LIMITS, type BuyerConversationView } from "@/modules/messaging/schema";
import { formatBrlForBuyer, formatCny } from "@/modules/products/pricing";
import { isWellFormedSessionToken } from "@/modules/stores/token";
import { KNOWN_CONVERSATIONS_KEY } from "./InquiryPanel";

const POLL_MS = 8_000;

const timeFormat = new Intl.DateTimeFormat("zh-CN", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Shanghai",
});

function tokenFromHash(): string | null {
  const match = /(?:^#|&)t=([A-Za-z0-9_-]{43})(?:&|$)/.exec(window.location.hash);
  return match && isWellFormedSessionToken(match[1]) ? match[1]! : null;
}

type Load = { state: "loading" } | { state: "invalid" } | { state: "error"; text: string } | { state: "ready"; view: BuyerConversationView };

/**
 * Conversa do comprador (direção B). Mostra suas entradas como escritas e as
 * respostas que o produtor confirmou, no idioma da conversa. Atualiza a cada
 * poucos segundos enquanto a aba está visível.
 */
export function BuyerConversation() {
  const [token, setToken] = useState<string | null>(null);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const pendingKey = useRef<string | null>(null);
  const threadEnd = useRef<HTMLLIElement>(null);
  const lastCount = useRef(0);

  const refresh = useCallback(async (secret: string) => {
    const result = await fetchJson<{ conversation: BuyerConversationView }>(
      "/api/buyer/conversation",
      { headers: { [BUYER_TOKEN_HEADER]: secret } },
      "网络连接失败，正在重试…",
    );
    if (result.ok) {
      setLoad({ state: "ready", view: result.data.conversation });
      // Conveniência local: a vitrine deste produto oferece "继续之前的对话" também em outro aparelho.
      const slug = result.data.conversation.product.showcasePath.split("/").pop();
      const known = safeStorage.get<Record<string, string>>("local", KNOWN_CONVERSATIONS_KEY) ?? {};
      if (slug && known[slug] !== secret) safeStorage.set("local", KNOWN_CONVERSATIONS_KEY, { ...known, [slug]: secret });
    } else if (result.status === 404) setLoad({ state: "invalid" });
    else setLoad((current) => (current.state === "ready" ? current : { state: "error", text: result.message }));
  }, []);

  useEffect(() => {
    const secret = tokenFromHash();
    /* eslint-disable react-hooks/set-state-in-effect -- o fragmento só existe no navegador */
    if (!secret) {
      setLoad({ state: "invalid" });
      return;
    }
    setToken(secret);
    setLink(`${window.location.origin}/conversa#t=${secret}`);
    /* eslint-enable react-hooks/set-state-in-effect */
    void refresh(secret);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh(secret);
    }, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void refresh(secret);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  // Rola até a mensagem nova quando o histórico cresce. Ao voltar pelo link
  // privado com resposta do produtor, abre direto na resposta mais recente.
  const count = load.state === "ready" ? load.view.messages.length : 0;
  const lastReplyId =
    load.state === "ready" ? ([...load.view.messages].reverse().find((m) => m.author !== "buyer")?.id ?? null) : null;
  useEffect(() => {
    if (count > lastCount.current && lastCount.current > 0) threadEnd.current?.scrollIntoView({ block: "nearest" });
    else if (lastCount.current === 0 && count > 0 && lastReplyId) {
      document.getElementById(`msg-${lastReplyId}`)?.scrollIntoView({ block: "start" });
    }
    lastCount.current = count;
  }, [count, lastReplyId]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
  };

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || sending) return;
    const text = draft.trim();
    if (!text) {
      setSendError("请填写留言内容。");
      return;
    }
    // A mesma chave em cada repetição deste envio evita mensagem duplicada.
    pendingKey.current ??= crypto.randomUUID();
    setSending(true);
    setSendError(null);
    const result = await fetchJson<{ conversation: BuyerConversationView }>(
      "/api/buyer/conversation/messages",
      { method: "POST", headers: { [BUYER_TOKEN_HEADER]: token }, json: { clientKey: pendingKey.current, message: text } },
      "网络连接失败。您的留言已保留，请重试。",
    );
    setSending(false);
    if (result.ok) {
      pendingKey.current = null;
      setDraft("");
      setLoad({ state: "ready", view: result.data.conversation });
      return;
    }
    setSendError(result.message);
  };

  if (load.state === "loading") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-ink-soft sm:px-6" aria-busy="true" role="status">
        正在载入对话…
      </div>
    );
  }
  if (load.state === "invalid") {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center sm:px-6">
        <h1 className="text-2xl font-semibold text-ink">未找到该对话</h1>
        <p className="mt-3 text-ink-soft">请确认私密链接是否完整（链接以 “#t=” 开头的部分不可缺少）。</p>
      </div>
    );
  }
  if (load.state === "error") {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center sm:px-6" role="alert">
        <h1 className="text-2xl font-semibold text-ink">暂时无法载入对话</h1>
        <p className="mt-3 text-ink-soft">{load.text}</p>
        <button
          type="button"
          onClick={() => token && void refresh(token)}
          className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-brand px-5 font-semibold text-white"
        >
          重试
        </button>
      </div>
    );
  }

  const { view } = load;
  const p = view.product;
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-2xl font-semibold text-ink">询价对话</h1>

      <section aria-label="咨询的产品" className="mt-4 flex gap-4 rounded-2xl border border-sand bg-paper p-4">
        {p.imageUrl && (
          // URL assinada e temporária do bucket privado.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.imageUrl} alt={`${p.title} 主图`} className="h-24 w-20 shrink-0 rounded-lg bg-ivory object-contain" />
        )}
        <div className="min-w-0">
          <p className="text-xs font-medium text-brand">{p.categoryZh}</p>
          <p lang={p.titleLang} className="mt-1 font-[family-name:var(--font-zh-serif)] text-xl font-bold text-ink">
            {p.title}
          </p>
          {p.pinyin && (
            <p lang="zh-Latn-pinyin" className="text-sm text-ink-soft">
              {p.pinyin}
            </p>
          )}
          <p lang="pt-BR" className="text-sm text-ink-soft">
            {p.originalName} · {p.producerName}
          </p>
          <p className="mt-2 text-sm text-ink">
            咨询时的产品版本：第 {p.version} 版
            {p.price && (
              <>
                {" · "}参考价格 <span className="font-semibold text-brand">{formatCny(p.price.cnyFen)}</span>{" "}
                <span className="text-ink-soft">({formatBrlForBuyer(p.price.brlCents)})</span>
              </>
            )}
          </p>
          {p.available ? (
            <a href={p.showcasePath} className="mt-2 inline-block text-sm font-medium text-brand underline underline-offset-4">
              查看产品页（最新版本）
            </a>
          ) : (
            <p className="mt-2 text-sm text-ink-soft">该产品已下架，本对话仍可继续。</p>
          )}
        </div>
      </section>

      <section aria-labelledby="private-link" className="mt-4 rounded-2xl border border-brand/30 bg-brand/5 p-4">
        <h2 id="private-link" className="text-sm font-semibold text-ink">
          私密链接 · 请保存以便返回本对话
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-soft">持有此链接的人可以查看并继续本对话，请勿公开分享。</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="private-link-url" className="sr-only">
            私密链接
          </label>
          <input
            id="private-link-url"
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 rounded-lg border border-sand bg-white px-3 py-2 text-sm text-ink"
          />
          <button
            type="button"
            onClick={copy}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-brand px-4 text-sm font-medium text-brand"
          >
            复制链接
          </button>
        </div>
        <p role="status" className="mt-1 text-xs text-ink-soft">
          {copied === "ok" ? "已复制。" : copied === "fail" ? "无法自动复制，请长按链接手动复制。" : ""}
        </p>
      </section>

      <section aria-labelledby="thread-title" className="mt-6">
        <h2 id="thread-title" className="sr-only">
          对话记录
        </h2>
        <p className="mb-2 text-right text-xs text-ink-soft">时间均为北京时间</p>
        <ol className="space-y-3" aria-live="polite" aria-relevant="additions">
          {view.messages.map((m) =>
            m.author === "buyer" ? (
              <li key={m.id} className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-brand px-4 py-3 text-white">
                <p className="text-xs text-white/80">
                  您{view.buyer.name ? `（${view.buyer.name}）` : ""} · {timeFormat.format(new Date(m.createdAt))}
                </p>
                <p lang={m.lang === "en" ? "en" : "zh-Hans"} className="mt-1 whitespace-pre-line break-words leading-relaxed">
                  {m.text}
                </p>
              </li>
            ) : (
              <li key={m.id} id={`msg-${m.id}`} className="mr-auto max-w-[85%] scroll-mt-4 rounded-2xl rounded-bl-sm border border-sand bg-paper px-4 py-3">
                <p className="text-xs text-ink-soft">
                  巴西生产者 · <span lang="pt-BR">{p.producerName}</span> · {timeFormat.format(new Date(m.createdAt))}
                </p>
                <p lang={m.lang} className="mt-1 whitespace-pre-line break-words leading-relaxed text-ink">
                  {m.text}
                </p>
                <details className="mt-2 text-xs text-ink-soft">
                  <summary className="cursor-pointer">查看葡萄牙语原文</summary>
                  <p lang="pt-BR" className="mt-1 whitespace-pre-line">
                    {m.originalPt}
                  </p>
                </details>
              </li>
            ),
          )}
          <li ref={threadEnd} aria-hidden="true" />
        </ol>
        {view.awaitingReply && (
          <p role="status" className="mt-4 rounded-xl bg-paper px-4 py-3 text-sm text-ink-soft">
            留言已送达。生产者确认回复后，回复会显示在这里（本页自动刷新）。
          </p>
        )}
      </section>

      <form onSubmit={send} noValidate className="mt-6 rounded-2xl border border-sand bg-paper p-4">
        <label htmlFor="buyer-reply" className="block text-sm font-medium text-ink">
          继续留言
        </label>
        <textarea
          id="buyer-reply"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          maxLength={LIMITS.body}
          aria-describedby={sendError ? "buyer-reply-error" : undefined}
          className="mt-1 block w-full rounded-xl border border-sand bg-white px-3 py-2.5 text-base leading-relaxed text-ink"
        />
        {sendError && (
          <p id="buyer-reply-error" role="alert" className="mt-2 text-sm text-brand">
            {sendError}
          </p>
        )}
        <button
          type="submit"
          disabled={sending}
          className="mt-3 flex min-h-12 w-full items-center justify-center rounded-xl bg-brand text-lg font-semibold text-white hover:bg-brand-strong disabled:cursor-wait disabled:opacity-80 sm:w-auto sm:px-8"
        >
          {sending ? "正在发送…" : "发送"}
        </button>
      </form>
    </div>
  );
}

