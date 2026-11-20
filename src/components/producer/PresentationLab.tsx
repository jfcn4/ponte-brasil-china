"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProductShowcase } from "@/components/public/ProductShowcase";
import { STRATEGIES, type HighlightSource, type IdentityOutput } from "@/modules/ai/identity-contract";
import { GENERATION_ERROR_MESSAGES, type LabState } from "@/modules/products/lab-state";
import {
  CHOICE_LABELS,
  type Choice,
  optionFor,
  previewSnapshot,
  recommendedChoice,
  snapshotToView,
} from "@/modules/products/presentation";
import { formatBrl, formatCny } from "@/modules/products/pricing";
import { PRODUCT_STATUS_LABELS } from "@/modules/products/schema";
import { buildDraftPreview } from "@/modules/products/showcase";
import { ShareCard } from "./ShareCard";

const SOURCE_LABELS: Record<HighlightSource, string> = {
  short_description: "Descrição curta",
  story: "História",
  differentiator: "O que torna especial",
  personality: "Personalidade",
  brand: "Marca",
  "attributes.type": "Tipo",
  "attributes.volume_ml": "Volume",
  "attributes.abv_percent": "Teor alcoólico",
  "attributes.wood": "Madeira",
  "attributes.aging_months": "Envelhecimento",
  "attributes.aroma": "Aroma",
  "attributes.flavor": "Sabor",
  "producer.city": "Cidade",
  "producer.state": "Estado",
  "producer.region": "Região",
};


type Phase = "idle" | "generating" | "publishing";

async function readError(response: Response): Promise<{ code?: string; message: string }> {
  const body = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  return {
    code: body?.error?.code,
    message: body?.error?.message ?? `Falha ao comunicar com o servidor (${response.status}).`,
  };
}

function defaultChoice(lab: LabState): Choice {
  if (!lab.usable) return "equilibrada";
  if (lab.published && lab.published.adaptationId === lab.usable.id) return lab.published.choice;
  return recommendedChoice(lab.usable.output);
}

export function PresentationLab({ initial, autoGenerate }: { initial: LabState; autoGenerate: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [lab, setLab] = useState(initial);
  const [choice, setChoice] = useState<Choice>(() => defaultChoice(initial));
  const [phase, setPhase] = useState<Phase>("idle");
  const [notice, setNotice] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  // Aprovação da apresentação da loja: por padrão, só quando a loja ainda não tem uma.
  const [introOverride, setIntroOverride] = useState<{ adaptationId: string; approve: boolean } | null>(null);
  const confirmDialog = useRef<HTMLDialogElement>(null);
  const shareHeading = useRef<HTMLHeadingElement>(null);
  const autoStarted = useRef(false);
  const phaseRef = useRef(phase);
  const labRef = useRef(lab);
  useEffect(() => {
    phaseRef.current = phase;
    labRef.current = lab;
  }, [phase, lab]);

  const applyLab = useCallback((next: LabState, options: { resetChoice?: boolean } = {}) => {
    if (options.resetChoice || labRef.current.usable?.id !== next.usable?.id) setChoice(defaultChoice(next));
    labRef.current = next;
    setLab(next);
  }, []);

  /** Relê o estado (ex.: depois de editar o cadastro em outra aba). */
  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/products/${initial.product.id}/publication`, { cache: "no-store" });
      if (!response.ok) return null;
      const { lab: next } = (await response.json()) as { lab: LabState };
      applyLab(next);
      return next;
    } catch {
      return null;
    }
  }, [applyLab, initial.product.id]);

  const generate = useCallback(async () => {
    if (phaseRef.current !== "idle") return;
    phaseRef.current = "generating";
    setPhase("generating");
    setNotice(null);
    try {
      const response = await fetch(`/api/products/${lab.product.id}/adaptations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedRevision: lab.product.revision }),
      });
      if (response.status === 201 || response.status === 502) {
        const { lab: next } = (await response.json()) as { lab: LabState };
        applyLab(next, { resetChoice: true });
        return;
      }
      const error = await readError(response);
      if (error.code === "revision_conflict" || error.code === "generation_in_progress") {
        await refresh();
      }
      setNotice({ tone: "error", text: error.message });
    } catch {
      setNotice({
        tone: "error",
        text: "Sem conexão com o servidor. Seu rascunho continua salvo; tente novamente quando a conexão voltar.",
      });
    } finally {
      phaseRef.current = "idle";
      setPhase("idle");
    }
  }, [applyLab, lab.product.id, lab.product.revision, refresh]);

  // Ao concluir o cadastro, o editor chega aqui com ?gerar=1.
  useEffect(() => {
    if (!autoGenerate || autoStarted.current) return;
    const id = setTimeout(() => {
      if (autoStarted.current) return;
      autoStarted.current = true;
      router.replace(pathname, { scroll: false });
      if (!initial.usable && initial.generationMissing.length === 0 && initial.latest?.status !== "generating") {
        void generate();
      }
    }, 0);
    return () => clearTimeout(id);
  }, [autoGenerate, generate, initial, pathname, router]);

  // Geração iniciada em outra aba: acompanha até terminar.
  useEffect(() => {
    if (lab.latest?.status !== "generating" || phase === "generating") return;
    const id = setTimeout(() => void refresh(), 3000);
    return () => clearTimeout(id);
  }, [lab, phase, refresh]);

  // Voltar a esta aba depois de editar o cadastro atualiza o estado.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && phaseRef.current === "idle") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  // -------------------------------------------------------------------------
  // Prévia: a mesma função que monta a versão publicada
  // -------------------------------------------------------------------------
  const output = lab.usable?.output ?? null;
  const preview = useMemo(() => {
    if (!output) return buildDraftPreview(lab.draft, lab.store, lab.images);
    return snapshotToView(previewSnapshot({ product: lab.draft, store: lab.store, output, choice }), lab.images);
  }, [output, lab.draft, lab.store, lab.images, choice]);

  const alreadyLive =
    lab.published !== null &&
    !lab.published.pending &&
    lab.usable !== null &&
    lab.published.adaptationId === lab.usable.id &&
    lab.published.choice === choice;
  const canPublish = lab.usable !== null && lab.publicationMissing.length === 0 && !alreadyLive && phase === "idle";

  const proposedIntro = output?.store_intro ?? null;
  const introAlreadyApproved = lab.usable !== null && lab.storeIntro?.adaptationId === lab.usable.id;
  const approveIntro =
    proposedIntro !== null &&
    !introAlreadyApproved &&
    (introOverride && introOverride.adaptationId === lab.usable?.id ? introOverride.approve : lab.storeIntro === null);

  const publish = async () => {
    if (!lab.usable || phaseRef.current !== "idle") return;
    phaseRef.current = "publishing";
    setPhase("publishing");
    setNotice(null);
    try {
      const response = await fetch(`/api/products/${lab.product.id}/publication`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          adaptationId: lab.usable.id,
          choice,
          expectedRevision: lab.product.revision,
          expectedMediaRevision: lab.product.mediaRevision,
          approveStoreIntro: approveIntro,
          confirmed: true,
        }),
      });
      confirmDialog.current?.close();
      if (!response.ok) {
        const error = await readError(response);
        if (error.code === "revision_conflict" || error.code === "adaptation_stale") {
          await refresh();
          setNotice({
            tone: "error",
            text: "O cadastro mudou desde que esta prévia foi aberta. A página foi atualizada: revise antes de publicar.",
          });
        } else {
          setNotice({ tone: "error", text: error.message });
        }
        return;
      }
      const { lab: next, published } = (await response.json()) as {
        lab: LabState;
        published: { version: number; created: boolean; storeIntroApproved: boolean };
      };
      applyLab(next);
      const introNote = published.storeIntroApproved ? " A apresentação da loja também foi aprovada." : "";
      setNotice({
        tone: "info",
        text:
          (published.created
            ? `Versão ${published.version} publicada. O link e o QR abaixo já mostram esta versão; o catálogo da loja também.`
            : `A versão ${published.version} já estava no ar. Nada foi duplicado.`) + introNote,
      });
      requestAnimationFrame(() => shareHeading.current?.focus());
    } catch {
      confirmDialog.current?.close();
      setNotice({ tone: "error", text: "Sem conexão com o servidor. Nada foi publicado; tente novamente." });
    } finally {
      phaseRef.current = "idle";
      setPhase("idle");
    }
  };

  const showcase = (
    <ProductShowcase view={preview} inquiry={{ enabled: false, reason: "Prévia: o comprador verá o botão de cotação ativo." }} />
  );
  const latestFailed = lab.latest?.status === "failed" && phase === "idle";
  const chosenOption = output && choice !== "original" ? optionFor(output, choice) : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-8">
      <div className="min-w-0">
        <nav aria-label="Navegação do produto" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Link href="/meu-espaco/produtos" className="text-mist hover:text-snow">
            ← Produtos
          </Link>
          <Link href={`/meu-espaco/produtos/${lab.product.id}`} className="text-mist hover:text-snow">
            Editar cadastro em português
          </Link>
        </nav>
        <div className="mt-2">
          <h1 className="text-2xl font-semibold tracking-tight text-snow">Apresentação em chinês</h1>
        </div>

        {lab.published && (
          <div className="mt-4 rounded-xl border border-line bg-panel p-4 text-sm">
            {lab.published.pending && (
              <p className="mt-1 text-warn">
                {PRODUCT_STATUS_LABELS.pending}: o cadastro mudou depois da publicação. A vitrine continua mostrando a
                versão {lab.published.version} até você republicar.
              </p>
            )}
            <a href={lab.published.url} target="_blank" rel="noreferrer" className="inline-block text-coral underline underline-offset-2">
              Ver a vitrine publicada <span className="sr-only">(abre em nova aba)</span>
            </a>
          </div>
        )}

        {notice && (
          <div
            role={notice.tone === "error" ? "alert" : "status"}
            className={`${notice.tone === "error" ? "mt-4 rounded-xl border p-4 text-sm" : ""} ${
              notice.tone === "error" ? "border-coral/60 bg-coral/10 text-snow" : "sr-only"
            }`}
          >
            {notice.text}
          </div>
        )}

        <GenerationPanel
          lab={lab}
          phase={phase}
          latestFailed={latestFailed}
          onGenerate={() => void generate()}
        />

        {output && (
          <>
            <NameOptions output={output} lab={lab} choice={choice} onChoose={setChoice} />

            {/* No celular, a prévia segue a escolha na ordem de leitura. */}
            <section aria-labelledby="preview-mobile" className="mt-8 lg:hidden">
              <h2 id="preview-mobile" className="text-lg font-semibold text-snow">
                Prévia da vitrine
              </h2>
              {showcase}
            </section>

            <ContentReview output={output} />

            <section
              id="publicar"
              aria-labelledby="publicar-titulo"
              className="mt-8 rounded-2xl border border-line bg-panel-2 p-5 sm:p-6"
            >
              <h2 id="publicar-titulo" className="text-lg font-semibold text-snow">
                {lab.published ? "Republicar" : "Publicar"}
              </h2>
              <ul className="mt-3 space-y-1.5 text-sm">
                <li className={lab.publicationMissing.includes("producer_name") ? "text-mist" : "text-ok"}>
                  <span aria-hidden="true">{lab.publicationMissing.includes("producer_name") ? "○ " : "✓ "}</span>
                  Produtor ou engenho identificado
                  {lab.store.producer_name && <span className="text-mist">: {lab.store.producer_name}</span>}
                  {lab.publicationMissing.includes("producer_name") && (
                    <>
                      {" — "}
                      <Link href={`/meu-espaco/produtos/${lab.product.id}#origem`} className="text-coral underline">
                        informar no cadastro
                      </Link>
                    </>
                  )}
                </li>
                <li className="text-ok">
                  <span aria-hidden="true">✓ </span>Nome escolhido: {CHOICE_LABELS[choice]}
                  {chosenOption && (
                    <span lang="zh-Hans" className="text-snow">
                      {" "}
                      · {chosenOption.hanzi}
                    </span>
                  )}
                </li>
              </ul>
              <button
                type="button"
                disabled={!canPublish}
                onClick={() => confirmDialog.current?.showModal()}
                className="mt-4 inline-flex min-h-12 items-center rounded-lg bg-brand px-6 font-semibold text-white hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50"
              >
                {lab.published ? "Republicar vitrine" : "Publicar vitrine"}
              </button>
              {alreadyLive && <p className="mt-2 text-sm text-mist">Esta versão, com este nome, já está no ar.</p>}
            </section>
          </>
        )}

        {lab.published && (
          <ShareCard
            headingRef={shareHeading}
            url={lab.published.url}
            qrSvg={lab.published.qrSvg}
            qrPngDataUrl={lab.published.qrPngDataUrl}
            fileName={`qr-${lab.published.url.split("/").pop()}.png`}
          />
        )}
        {lab.published && lab.storeUrl && (
          <p className="mt-3 text-sm text-mist">
            Este produto também aparece no catálogo da loja, na ordem definida em Produtos.{" "}
            <Link href="/meu-espaco/minha-loja" className="text-coral underline underline-offset-2">
              Ver link e QR da loja
            </Link>
          </p>
        )}
      </div>

      <aside className="hidden lg:block" aria-label="Prévia da vitrine">
        <div className="sticky top-6">
          <p className="mb-1 text-sm font-medium text-snow">Prévia da vitrine</p>
          <div className="max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-3xl">{showcase}</div>
        </div>
      </aside>

      <dialog
        ref={confirmDialog}
        aria-labelledby="confirmar-titulo"
        className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-2xl border border-line bg-panel p-0 text-snow"
      >
        <div className="p-5 sm:p-6">
          <h2 id="confirmar-titulo" className="text-lg font-semibold">
            Confirmar publicação
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-mist">Nome na vitrine</dt>
              <dd className="mt-0.5 text-base">
                <span lang={preview.titleLang} className="font-semibold">
                  {preview.title}
                </span>
                {preview.pinyin && <span className="text-mist"> · {preview.pinyin}</span>}
              </dd>
            </div>
            <div>
              <dt className="text-mist">Preço de referência</dt>
              <dd className="mt-0.5">
                {preview.price ? (
                  <>
                    <span lang="zh-Hans">参考价格 {formatCny(preview.price.cnyFen)}</span>{" "}
                    <span className="text-mist">({formatBrl(preview.price.brlCents)} · taxa demonstrativa 1,15)</span>
                  </>
                ) : (
                  "Sem preço (só “询价”)"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-mist">Fotos</dt>
              <dd className="mt-0.5">
                {lab.images.length} {lab.images.length === 1 ? "foto" : "fotos"}
              </dd>
            </div>
            {proposedIntro && (
              <div>
                <dt className="text-mist">Apresentação da loja</dt>
                <dd className="mt-1 space-y-1">
                  <p lang="zh-Hans" className="text-base">
                    {proposedIntro.zh}
                  </p>
                  <p className="text-mist">{proposedIntro.pt}</p>
                  {introAlreadyApproved ? (
                    <p className="text-ok">Já aprovada: é a apresentação atual do catálogo.</p>
                  ) : (
                    <label className="mt-1 flex min-h-11 cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={approveIntro}
                        onChange={(event) =>
                          lab.usable && setIntroOverride({ adaptationId: lab.usable.id, approve: event.target.checked })
                        }
                        className="h-5 w-5 accent-[var(--color-brand)]"
                      />
                      {lab.storeIntro ? "Substituir a apresentação atual da loja por esta" : "Aprovar como apresentação da loja"}
                    </label>
                  )}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-mist">Endereço</dt>
              <dd className="mt-0.5">
                {lab.published
                  ? `Substitui a versão ${lab.published.version} no mesmo link e QR.`
                  : "Cria o link público e o QR desta vitrine."}
              </dd>
            </div>
          </dl>
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => confirmDialog.current?.close()}
              className="min-h-11 rounded-lg border border-line px-4 text-sm font-medium"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void publish()}
              disabled={phase !== "idle"}
              className="min-h-11 rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-60"
            >
              {phase === "publishing" ? "Publicando…" : "Confirmar publicação"}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------

// Marcos [ms desde o início, % exibido]: arranca rápido, desacelera e avança em saltos.
const PROGRESS_STEPS: ReadonlyArray<readonly [number, number]> = [
  [100, 12],
  [600, 28],
  [1200, 41],
  [2500, 49],
  [4000, 62],
  [6500, 68],
  [9000, 77],
  [12500, 83],
  [16000, 88],
  [21000, 91],
  [27000, 94],
];

function SimulatedProgress() {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const timers = PROGRESS_STEPS.map(([at, value]) => setTimeout(() => setPct(value), at));
    // Depois do último marco, avança em fração mínima sem nunca chegar a 100%.
    const creep = setInterval(() => setPct((p) => (p >= 94 ? Math.min(p + 0.4, 98) : p)), 3000);
    return () => {
      timers.forEach(clearTimeout);
      clearInterval(creep);
    };
  }, []);

  return (
    <div aria-hidden="true" className="mt-3 h-1 overflow-hidden rounded-full bg-line">
      <div
        className="h-full rounded-full bg-coral transition-[width] duration-700 ease-out motion-reduce:transition-none"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function GenerationPanel({
  lab,
  phase,
  latestFailed,
  onGenerate,
}: {
  lab: LabState;
  phase: Phase;
  latestFailed: boolean;
  onGenerate: () => void;
}) {
  const busy = phase === "generating" || lab.latest?.status === "generating";
  const blocked = lab.generationMissing.length > 0;

  return (
    <section aria-labelledby="geracao-titulo" className="mt-6">
      <h2 id="geracao-titulo" className="sr-only">
        Geração
      </h2>
      <div role="status" aria-live="polite">
        {busy && (
          <div className="rounded-xl border border-line bg-panel p-4">
            <p className="flex items-center gap-3 font-medium text-snow">
              <span aria-hidden="true" className="h-3 w-3 animate-pulse rounded-full bg-coral" />
              Gerando três nomes e a vitrine em chinês…
            </p>
            <SimulatedProgress />
          </div>
        )}
      </div>

      {!busy && blocked && (
        <div className="rounded-xl border border-line bg-panel p-4 text-sm">
          <p className="font-medium text-snow">Faltam dados para gerar a apresentação:</p>
          <ul className="mt-2 list-inside list-disc text-mist">
            {lab.generationMissing.includes("name") && <li>Nome da cachaça</li>}
            {lab.generationMissing.includes("short_description") && <li>Descrição curta</li>}
            {lab.generationMissing.includes("image") && <li>Pelo menos uma foto</li>}
          </ul>
          <Link
            href={`/meu-espaco/produtos/${lab.product.id}`}
            className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-line px-4 font-medium text-snow hover:border-coral"
          >
            Completar o cadastro
          </Link>
        </div>
      )}

      {!busy && !blocked && latestFailed && (
        <div role="alert" className="rounded-xl border border-coral/60 bg-coral/10 p-4 text-sm">
          <p className="font-medium text-snow">A geração não deu certo.</p>
          <p className="mt-1 text-mist">
            {GENERATION_ERROR_MESSAGES[lab.latest?.errorCode ?? ""] ?? "Erro inesperado na geração."}
          </p>
          <button
            type="button"
            onClick={onGenerate}
            className="mt-3 min-h-11 rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-strong"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {!busy && !blocked && !latestFailed && !lab.usable && (
        <div className="rounded-xl border border-line bg-panel p-4 text-sm">
          <p className="text-snow">
            {lab.hasStaleReady
              ? "O cadastro mudou depois da última geração. Gere novas opções."
              : "Gere três propostas de nome chinês e os textos da vitrine."}
          </p>
          <button
            type="button"
            onClick={onGenerate}
            className="mt-3 min-h-11 rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-strong"
          >
            Gerar apresentação chinesa
          </button>
        </div>
      )}

      {!busy && lab.usable && (
        <div className="flex flex-wrap items-center justify-end gap-3 text-sm text-mist">
          <button
            type="button"
            onClick={onGenerate}
            disabled={blocked}
            className="min-h-10 rounded-lg border border-line px-4 font-medium text-snow hover:border-coral disabled:opacity-50"
          >
            Gerar novas opções
          </button>
        </div>
      )}

      {lab.usable?.isTestAdapter && (
        <p className="mt-3 rounded-lg border border-warn/50 bg-warn/10 px-3 py-2 text-sm text-warn">
          Resposta de teste, sem IA real. Use apenas para ensaio.
        </p>
      )}
    </section>
  );
}

function NameOptions({
  output,
  lab,
  choice,
  onChoose,
}: {
  output: IdentityOutput;
  lab: LabState;
  choice: Choice;
  onChoose: (choice: Choice) => void;
}) {
  const recommended = recommendedChoice(output);
  return (
    <fieldset className="mt-6">
      <legend className="text-lg font-semibold text-snow">Escolha o nome</legend>
      <div className="mt-2 rounded-xl border border-coral/40 bg-coral/5 p-4 text-sm">
        <p className="font-medium text-snow">Recomendação: {CHOICE_LABELS[recommended]}</p>
        <p className="mt-1 text-mist">{output.recommendation.reason}</p>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
        {STRATEGIES.map((strategy) => {
          const option = optionFor(output, strategy);
          if (!option) return null;
          const selected = choice === strategy;
          return (
            <div
              key={strategy}
              className={`flex flex-col rounded-2xl border-2 bg-panel p-4 transition-colors ${
                selected ? "border-coral" : "border-line"
              }`}
            >
              <label className="flex cursor-pointer flex-col gap-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-coral">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="flex items-center gap-2 text-sm font-medium text-snow">
                    <input
                      type="radio"
                      name="nome-chines"
                      value={strategy}
                      checked={selected}
                      onChange={() => onChoose(strategy)}
                      className="h-4 w-4 accent-[#ff8587]"
                    />
                    {CHOICE_LABELS[strategy]}
                  </span>
                  {strategy === recommended && (
                    <span className="text-xs font-medium text-coral">Recomendada</span>
                  )}
                </span>
                <span
                  lang="zh-Hans"
                  className="whitespace-nowrap font-[family-name:var(--font-zh-serif)] text-3xl font-bold text-snow sm:text-[1.75rem] xl:text-3xl"
                >
                  {option.hanzi}
                </span>
                <span lang="zh-Latn-pinyin" className="text-base text-snow/90">
                  {option.pinyin}
                </span>
                <span className="text-sm text-mist">{option.meaning}</span>
              </label>
              <details className="mt-3 text-sm text-mist [&_summary]:min-h-10">
                <summary className="flex cursor-pointer items-center text-snow hover:text-coral">
                  Por que este nome
                </summary>
                <dl className="mt-2 space-y-2">
                  <Detail term="Justificativa" value={option.rationale} />
                  <Detail term="Relação com o original" value={option.relation_to_original} />
                  <Detail term="Personalidade" value={option.personality_link} />
                  <Detail term="Estética" value={option.aesthetics} />
                  <Detail term="Pronúncia" value={option.pronunciation} />
                  <Detail term="Memorização" value={option.memorability} />
                  <Detail term="Ganhos" value={option.gains} />
                  <Detail term="Perdas" value={option.losses} />
                  <Detail term="Ambiguidades" value={option.ambiguities} empty="Nenhuma identificada." />
                </dl>
              </details>
            </div>
          );
        })}
      </div>

      <label
        className={`mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border-2 bg-panel p-4 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-coral ${
          choice === "original" ? "border-coral" : "border-line"
        }`}
      >
        <input
          type="radio"
          name="nome-chines"
          value="original"
          checked={choice === "original"}
          onChange={() => onChoose("original")}
          className="mt-0.5 h-4 w-4 accent-[#ff8587]"
        />
        <span>
          <span className="font-medium text-snow">Manter o nome original</span>
          <span className="mt-0.5 block text-mist">
            A vitrine usa “{lab.draft.name}” como título, acompanhado da categoria em chinês{" "}
            <span lang="zh-Hans">卡沙萨 · 巴西甘蔗蒸馏酒</span>.
          </span>
        </span>
      </label>
    </fieldset>
  );
}

function Detail({ term, value, empty }: { term: string; value: string | string[]; empty?: string }) {
  const list = Array.isArray(value) ? value : null;
  return (
    <div>
      <dt className="font-medium text-snow/90">{term}</dt>
      <dd>
        {list ? (
          list.length === 0 ? (
            (empty ?? "—")
          ) : (
            <ul className="list-inside list-disc">
              {list.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

function ContentReview({ output }: { output: IdentityOutput }) {
  const rows: Array<{ label: string; zh: string; pt: string; source?: string }> = [
    { label: "Frase de abertura", ...output.content.tagline },
    { label: "Descrição", ...output.content.description },
  ];
  if (output.content.story) rows.push({ label: "História", ...output.content.story });
  output.content.highlights.forEach((h, i) =>
    rows.push({ label: `Destaque ${i + 1}`, zh: h.zh, pt: h.pt, source: SOURCE_LABELS[h.source_field] }),
  );
  if (output.store_intro) {
    rows.push({ label: "Apresentação da loja", ...output.store_intro, source: "Produtor e origem (aprovada na publicação)" });
  }

  return (
    <section aria-labelledby="textos-titulo" className="mt-8">
      <h2 id="textos-titulo" className="text-lg font-semibold text-snow">
        Textos da vitrine
      </h2>
      <p className="mt-1 text-sm text-mist">
        Para corrigir um texto, ajuste o cadastro e gere novamente.
      </p>
      <ul className="mt-4 divide-y divide-line rounded-xl border border-line bg-panel">
        {rows.map((row) => (
          <li key={row.label} className="grid gap-1 p-4 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
            <p className="text-sm font-medium text-snow">
              {row.label}
              {row.source && <span className="block text-xs font-normal text-mist">Fonte: {row.source}</span>}
            </p>
            <div className="min-w-0">
              <p lang="zh-Hans" className="text-snow">
                {row.zh}
              </p>
              <p className="mt-1 text-sm text-mist">{row.pt}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
