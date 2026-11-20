"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProductShowcase } from "@/components/public/ProductShowcase";
import { type ProductForm, formToDraft, maxLengthOf } from "@/modules/products/form";
import { convertBrlCentsToCnyFen, formatCny } from "@/modules/products/pricing";
import {
  AVAILABILITY_LABELS,
  AVAILABILITY_OPTIONS,
  BR_STATES,
  CACHACA_TYPES,
  CACHACA_TYPE_LABELS,
  ImagesResponse,
  LIMITS,
  PERSONALITY_LABELS,
  PERSONALITY_TRAITS,
  type DisplayStatus,
  type ProductImageView,
  SaveDraftResponse,
  missingForGeneration,
} from "@/modules/products/schema";
import { buildDraftPreview } from "@/modules/products/showcase";
import { Section, SelectField, TextArea, TextField, UnitField } from "./fields";
import { type PendingUpload, PhotoManager } from "./PhotoManager";
import { ImagePrepError, prepareImage } from "./prepareImage";
import { StatusLabel } from "./StatusLabel";

export type EditorInitial = {
  productId: string | null;
  revision: number | null;
  updatedAt: string | null;
  form: ProductForm;
  images: ProductImageView[];
  status: DisplayStatus;
  /** Endereço público da versão no ar, se houver. */
  publicPath: string | null;
};

type SaveState =
  | { kind: "idle" }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved"; at: Date }
  | { kind: "invalid" }
  | { kind: "error"; message: string }
  | { kind: "conflict" };

const AUTOSAVE_MS = 1000;
const timeFormat = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? `Falha ao comunicar com o servidor (${response.status}).`;
}

export function ProductEditor({ initial }: { initial: EditorInitial }) {
  const router = useRouter();
  const [generateNotice, setGenerateNotice] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  // Publicado + qualquer edição salva nesta página = alterações pendentes.
  const [touched, setTouched] = useState(false);
  const status: DisplayStatus = initial.status === "published" && touched ? "pending" : initial.status;
  const [form, setForm] = useState<ProductForm>(initial.form);
  const [productId, setProductId] = useState<string | null>(initial.productId);
  const [images, setImages] = useState<ProductImageView[]>(initial.images);
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);
  const [busyImageId, setBusyImageId] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>(
    initial.updatedAt ? { kind: "saved", at: new Date(initial.updatedAt) } : { kind: "idle" },
  );

  const formRef = useRef(form);
  const productIdRef = useRef(initial.productId);
  const revisionRef = useRef(initial.revision);
  const inflight = useRef<Promise<boolean> | null>(null);
  const queued = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uploadBlobs = useRef(new Map<string, { file: File }>());
  const uploadChain = useRef<Promise<void>>(Promise.resolve());
  const previewDialog = useRef<HTMLDialogElement>(null);
  const conflicted = useRef(false);

  const draft = useMemo(() => formToDraft(form), [form]);
  const errors = draft.errors;

  // -------------------------------------------------------------------------
  // Persistência do rascunho (revisão comparada no servidor)
  // -------------------------------------------------------------------------
  const persist = useCallback((): Promise<boolean> => {
    if (conflicted.current) return Promise.resolve(false);
    if (inflight.current) {
      queued.current = true;
      return inflight.current;
    }

    const saveOnce = async (): Promise<boolean> => {
      const snapshot = formRef.current;
      const result = formToDraft(snapshot);
      if (!result.ok) {
        setSave({ kind: "invalid" });
        return false;
      }
      setSave({ kind: "saving" });
      const id = productIdRef.current;
      try {
        const response = await fetch(id ? `/api/products/${id}` : "/api/products", {
          method: id ? "PUT" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            expectedRevision: id ? revisionRef.current : null,
            product: result.product,
            store: result.store,
          }),
        });
        if (response.status === 409) {
          conflicted.current = true;
          setSave({ kind: "conflict" });
          return false;
        }
        if (!response.ok) {
          setSave({ kind: "error", message: await readError(response) });
          return false;
        }
        const data = SaveDraftResponse.parse(await response.json());
        productIdRef.current = data.product.id;
        revisionRef.current = data.product.revision;
        if (!id) {
          setProductId(data.product.id);
          // Atualiza o endereço sem remontar o editor (preserva envios em andamento).
          window.history.replaceState(null, "", `/meu-espaco/produtos/${data.product.id}`);
        }
        setSave(formRef.current === snapshot ? { kind: "saved", at: new Date(data.product.updatedAt) } : { kind: "dirty" });
        return true;
      } catch {
        setSave({ kind: "error", message: "Sem conexão com o servidor. Suas alterações continuam nesta página." });
        return false;
      }
    };

    // Uma gravação por vez; mudanças feitas durante o envio geram mais uma rodada.
    const loop = async () => {
      let ok = await saveOnce();
      while (queued.current && !conflicted.current) {
        queued.current = false;
        ok = await saveOnce();
      }
      return ok;
    };
    const promise = loop().finally(() => {
      inflight.current = null;
    });
    inflight.current = promise;
    return promise;
  }, []);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    return persist();
  }, [persist]);

  const update = useCallback(
    <K extends keyof ProductForm>(field: K, value: ProductForm[K]) => {
      setForm((prev) => {
        const next = { ...prev, [field]: value };
        formRef.current = next;
        return next;
      });
      if (conflicted.current) return;
      setTouched(true);
      setSave({ kind: "dirty" });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void persist(), AUTOSAVE_MS);
    },
    [persist],
  );

  // Aviso ao sair com alterações ou envios pendentes.
  const hasPending = save.kind === "dirty" || save.kind === "saving" || uploads.some((u) => u.status !== "error");
  useEffect(() => {
    if (!hasPending) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasPending]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  /** A foto precisa de um produto: cria o rascunho antes, se ainda não existe. */
  const ensureProduct = useCallback(async (): Promise<string | null> => {
    if (productIdRef.current) return productIdRef.current;
    await flush();
    if (!productIdRef.current && inflight.current) await inflight.current;
    return productIdRef.current;
  }, [flush]);

  // -------------------------------------------------------------------------
  // Fotos
  // -------------------------------------------------------------------------
  const patchUpload = (key: string, patch: Partial<PendingUpload>) =>
    setUploads((list) => list.map((u) => (u.key === key ? { ...u, ...patch } : u)));

  const dropUpload = (key: string) => {
    setUploads((list) => {
      const item = list.find((u) => u.key === key);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return list.filter((u) => u.key !== key);
    });
    uploadBlobs.current.delete(key);
  };

  const runUpload = useCallback(
    (key: string) => {
      uploadChain.current = uploadChain.current.then(async () => {
        const source = uploadBlobs.current.get(key);
        if (!source) return;
        patchUpload(key, { status: "processing", message: undefined });
        try {
          const prepared = await prepareImage(source.file);
          const id = await ensureProduct();
          if (!id) {
            patchUpload(key, {
              status: "error",
              message: "Salve o rascunho antes de enviar a foto (confira os campos destacados).",
            });
            return;
          }
          patchUpload(key, { status: "uploading" });
          const body = new FormData();
          body.append("file", prepared.blob, "foto.jpg");
          body.append("width", String(prepared.width));
          body.append("height", String(prepared.height));
          const response = await fetch(`/api/products/${id}/images`, { method: "POST", body });
          if (!response.ok) {
            patchUpload(key, { status: "error", message: await readError(response) });
            return;
          }
          setImages(ImagesResponse.parse(await response.json()).images);
          setTouched(true);
          dropUpload(key);
        } catch (error) {
          patchUpload(key, {
            status: "error",
            message:
              error instanceof ImagePrepError
                ? error.message
                : "O envio falhou. Verifique a conexão e tente novamente.",
          });
        }
      });
    },
    [ensureProduct],
  );

  const addFiles = (files: File[]) => {
    const active = uploads.filter((u) => u.status !== "error").length;
    const free = LIMITS.maxImages - images.length - active;
    const accepted = files.slice(0, Math.max(0, free));
    const rejected = files.length - accepted.length;
    setPhotoNotice(
      rejected > 0
        ? `Cada produto aceita até três fotos. ${rejected} ${rejected === 1 ? "foto não foi adicionada" : "fotos não foram adicionadas"}.`
        : null,
    );
    for (const file of accepted) {
      const key = crypto.randomUUID();
      uploadBlobs.current.set(key, { file });
      setUploads((list) => [
        ...list,
        { key, fileName: file.name, previewUrl: URL.createObjectURL(file), status: "processing" },
      ]);
      runUpload(key);
    }
  };

  const imageAction = async (imageId: string, request: () => Promise<Response>) => {
    setBusyImageId(imageId);
    setPhotoNotice(null);
    try {
      const response = await request();
      if (!response.ok) {
        setPhotoNotice(await readError(response));
        return;
      }
      setImages(ImagesResponse.parse(await response.json()).images);
      setTouched(true);
    } catch {
      setPhotoNotice("Sem conexão com o servidor. Tente novamente.");
    } finally {
      setBusyImageId(null);
    }
  };

  // -------------------------------------------------------------------------
  // Prévia e prontidão para gerar
  // -------------------------------------------------------------------------
  const preview = useMemo(() => buildDraftPreview(draft.product, draft.store, images), [draft, images]);
  const missing = missingForGeneration({
    name: draft.product.name,
    short_description: draft.product.short_description,
    imageCount: images.length,
  });
  const cnyFen = convertBrlCentsToCnyFen(draft.product.price_brl_cents);

  /** Conclui o cadastro: salva o que falta e abre o laboratório, que gera a apresentação. */
  const goToGeneration = async () => {
    setGenerateNotice(null);
    if (!draft.ok) {
      setGenerateNotice("Corrija os campos destacados antes de gerar.");
      return;
    }
    if (missing.length > 0) return;
    setLeaving(true);
    const pendingSave = timer.current !== null || save.kind === "dirty" || save.kind === "error" || !productIdRef.current;
    const ok = pendingSave ? await flush() : inflight.current ? await inflight.current : true;
    if (!ok || !productIdRef.current) {
      setLeaving(false);
      setGenerateNotice("Não foi possível salvar o rascunho. Tente novamente.");
      return;
    }
    router.push(`/meu-espaco/produtos/${productIdRef.current}/apresentacao?gerar=1`);
  };

  const showcase = (
    <ProductShowcase
      view={preview}
      inquiry={{ enabled: false, reason: "Prévia: a cotação funciona após publicar." }}
    />
  );

  const togglePersonality = (trait: (typeof PERSONALITY_TRAITS)[number]) => {
    const has = form.personality.includes(trait);
    if (!has && form.personality.length >= LIMITS.maxPersonality) return;
    update("personality", has ? form.personality.filter((t) => t !== trait) : [...form.personality, trait]);
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_25rem] lg:gap-8 lg:pb-12">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href="/meu-espaco/produtos" className="text-sm text-mist hover:text-snow">
              ← Produtos
            </Link>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-snow">
              {productId ? "Editar cachaça" : "Nova cachaça"}
            </h1>
            {initial.status !== "draft" && <StatusLabel status={status} className="mt-0.5" />}
            {initial.publicPath && (
              <p className="mt-1 text-sm">
                <a href={initial.publicPath} target="_blank" rel="noreferrer" className="text-coral underline underline-offset-2">
                  Ver vitrine no ar <span className="sr-only">(nova aba)</span>
                </a>
              </p>
            )}
            {initial.status !== "draft" && (
              <p className="mt-1 text-sm text-mist">A vitrine só muda quando você republicar.</p>
            )}
          </div>
          <div className="hidden flex-col items-end gap-1 lg:flex">
            <SaveButton state={save} onSave={() => void flush()} />
            <SaveStatus state={save} onRetry={() => void flush()} />
          </div>
        </div>

        {save.kind === "conflict" && (
          <div role="alert" className="mt-4 rounded-xl border border-coral/60 bg-coral/10 p-4 text-sm">
            <p className="font-medium text-snow">Este rascunho foi alterado em outra aba ou janela.</p>
            <p className="mt-1 text-mist">
              Salvamento pausado. Recarregue para continuar da versão mais recente.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-3 min-h-10 rounded-lg bg-brand px-4 font-medium text-white"
            >
              Recarregar rascunho
            </button>
          </div>
        )}

        <form
          className="mt-6 grid gap-6 [&>*]:min-w-0"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void flush();
          }}
        >
          <Section
            id="identidade"
            number={1}
            title="Identidade"
            description="Nome, descrição e uma foto bastam para gerar a versão em chinês."
            visibility="Aparece na vitrine"
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                label="Nome da cachaça"
                value={form.name}
                onChange={(v) => update("name", v)}
                maxLength={maxLengthOf("name")}
                placeholder="Ex.: Serra Azul Ouro"
                error={errors.name}
              />
              <TextField
                label="Marca"
                optional
                value={form.brand}
                onChange={(v) => update("brand", v)}
                maxLength={maxLengthOf("brand")}
                placeholder="Se for diferente do nome"
                error={errors.brand}
              />
            </div>
            <TextArea
              label="Descrição curta"
              value={form.short_description}
              onChange={(v) => update("short_description", v)}
              maxLength={LIMITS.shortDescription}
              rows={3}
              placeholder="Em uma ou duas frases"
              error={errors.short_description}
            />
            <PhotoManager
              images={images}
              uploads={uploads}
              notice={photoNotice}
              busyImageId={busyImageId}
              onAddFiles={addFiles}
              onRetry={runUpload}
              onDiscard={dropUpload}
              onMakePrimary={(imageId) =>
                void imageAction(imageId, () =>
                  fetch(`/api/products/${productIdRef.current}/images/${imageId}/primary`, { method: "POST" }),
                )
              }
              onRemove={(imageId) =>
                void imageAction(imageId, () =>
                  fetch(`/api/products/${productIdRef.current}/images/${imageId}`, { method: "DELETE" }),
                )
              }
            />
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-snow">
                Personalidade <span className="font-normal text-mist">(até duas · opcional)</span>
              </legend>
              <p className="mb-3 text-sm text-mist">Orienta o tom da apresentação em chinês.</p>
              <div className="flex flex-wrap gap-2">
                {PERSONALITY_TRAITS.map((trait) => {
                  const checked = form.personality.includes(trait);
                  const disabled = !checked && form.personality.length >= LIMITS.maxPersonality;
                  return (
                    <label
                      key={trait}
                      className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-coral ${
                        checked
                          ? "border-coral bg-coral/15 text-snow"
                          : disabled
                            ? "cursor-not-allowed border-line text-mist/50"
                            : "border-line text-mist hover:border-mist hover:text-snow"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => togglePersonality(trait)}
                      />
                      <span aria-hidden="true">{checked ? "✓" : "+"}</span>
                      {PERSONALITY_LABELS[trait]}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </Section>

          <Section
            id="caracteristicas"
            number={2}
            title="Características"
            description="Dados técnicos, com as unidades que você informar."
            visibility="Aparece na vitrine"
          >
            <SelectField
              label="Tipo de cachaça"
              optional
              value={form.type}
              onChange={(v) => update("type", v)}
              options={CACHACA_TYPES.map((t) => ({ value: t, label: CACHACA_TYPE_LABELS[t] }))}
              error={errors.type}
            />
            <div className="grid gap-5 sm:grid-cols-3">
              <UnitField
                label="Volume"
                optional
                unit="mL"
                value={form.volume_ml}
                onChange={(v) => update("volume_ml", v)}
                placeholder="700"
                error={errors.volume_ml}
              />
              <UnitField
                label="Teor alcoólico"
                optional
                unit="%"
                inputMode="decimal"
                value={form.abv_percent}
                onChange={(v) => update("abv_percent", v)}
                placeholder="40"
                error={errors.abv_percent}
              />
              <UnitField
                label="Envelhecimento"
                optional
                unit="meses"
                value={form.aging_months}
                onChange={(v) => update("aging_months", v)}
                placeholder="24"
                error={errors.aging_months}
              />
            </div>
            <TextField
              label="Madeira"
              optional
              value={form.wood}
              onChange={(v) => update("wood", v)}
              maxLength={maxLengthOf("wood")}
              placeholder="Ex.: amburana, carvalho, bálsamo"
              error={errors.wood}
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                label="Aroma"
                optional
                value={form.aroma}
                onChange={(v) => update("aroma", v)}
                maxLength={maxLengthOf("aroma")}
                placeholder="Ex.: baunilha, cana fresca"
                error={errors.aroma}
              />
              <TextField
                label="Sabor"
                optional
                value={form.flavor}
                onChange={(v) => update("flavor", v)}
                maxLength={maxLengthOf("flavor")}
                placeholder="Ex.: suave, final adocicado"
                error={errors.flavor}
              />
            </div>
          </Section>

          <Section
            id="origem"
            number={3}
            title="Origem e história"
            description="Quem produz e de onde vem. Valem para toda a loja."
            visibility="Aparece na vitrine e na loja"
          >
            <TextField
              label="Nome do produtor ou engenho"
              hint="Necessário para publicar."
              value={form.producer_name}
              onChange={(v) => update("producer_name", v)}
              maxLength={maxLengthOf("producer_name")}
              autoComplete="organization"
              error={errors.producer_name}
            />
            <div className="grid gap-5 sm:grid-cols-[1fr_8rem]">
              <TextField
                label="Cidade"
                optional
                value={form.city}
                onChange={(v) => update("city", v)}
                maxLength={maxLengthOf("city")}
                autoComplete="address-level2"
                error={errors.city}
              />
              <SelectField
                label="Estado"
                optional
                value={form.state}
                onChange={(v) => update("state", v)}
                options={BR_STATES.map((uf) => ({ value: uf, label: uf }))}
                placeholder="UF"
                error={errors.state}
              />
            </div>
            <TextField
              label="Região"
              optional
              value={form.region}
              onChange={(v) => update("region", v)}
              maxLength={maxLengthOf("region")}
              placeholder="Ex.: Norte de Minas, Serra Gaúcha"
              error={errors.region}
            />
            <TextArea
              label="História"
              optional
              value={form.story}
              onChange={(v) => update("story", v)}
              maxLength={LIMITS.story}
              rows={5}
              placeholder="Como o engenho começou e quem produz"
              error={errors.story}
            />
            <TextArea
              label="O que torna sua cachaça especial?"
              optional
              value={form.differentiator}
              onChange={(v) => update("differentiator", v)}
              maxLength={LIMITS.differentiator}
              rows={3}
              error={errors.differentiator}
            />
          </Section>

          <Section
            id="comercial"
            number={4}
            title="Informações comerciais"
            description="Valores de referência. O preço final é negociado."
            visibility="Preço, pedido mínimo e disponibilidade aparecem na vitrine"
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <UnitField
                  label="Preço de referência"
                  optional
                  unit="R$"
                  unitPosition="prefix"
                  inputMode="decimal"
                  value={form.price}
                  onChange={(v) => update("price", v)}
                  placeholder="79,00"
                  hint="Deixe vazio para mostrar apenas “Solicitar cotação”."
                  error={errors.price}
                />
                {cnyFen !== null && !errors.price && (
                  <p className="mt-2 text-sm text-snow" aria-live="polite">
                    Na vitrine: <strong lang="zh-Hans">参考价格 {formatCny(cnyFen)}</strong>{" "}
                    <span className="text-mist">(taxa demonstrativa BRL 1 = CNY 1,15)</span>
                  </p>
                )}
              </div>
              <UnitField
                label="Pedido mínimo"
                optional
                unit="garrafas"
                value={form.min_order_units}
                onChange={(v) => update("min_order_units", v)}
                placeholder="100"
                error={errors.min_order_units}
              />
            </div>
            <SelectField
              label="Disponibilidade"
              optional
              value={form.availability}
              onChange={(v) => update("availability", v)}
              options={AVAILABILITY_OPTIONS.map((a) => ({ value: a, label: AVAILABILITY_LABELS[a] }))}
              error={errors.availability}
            />
            <TextArea
              label="Observações"
              optional
              privacy="privado"
              value={form.notes}
              onChange={(v) => update("notes", v)}
              maxLength={LIMITS.notes}
              rows={3}
              hint="Só para você. Não aparece na vitrine."
              error={errors.notes}
            />
          </Section>

          <section aria-labelledby="gerar-titulo" className="rounded-2xl border border-line bg-panel-2 p-5 sm:p-6">
            <h2 id="gerar-titulo" className="text-lg font-semibold text-snow">
              Apresentação em chinês
            </h2>
            <ul className="mt-3 space-y-1.5 text-sm">
              {(
                [
                  ["name", "Nome da cachaça"],
                  ["short_description", "Descrição curta"],
                  ["image", "Pelo menos uma foto"],
                ] as const
              ).map(([key, label]) => {
                const ok = !missing.includes(key);
                return (
                  <li key={key} className={ok ? "text-ok" : "text-mist"}>
                    <span aria-hidden="true">{ok ? "✓ " : "○ "}</span>
                    {label}
                    <span className="sr-only">{ok ? " — preenchido" : " — pendente"}</span>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              onClick={() => void goToGeneration()}
              disabled={missing.length > 0 || leaving || save.kind === "conflict"}
              aria-describedby={missing.length === 0 ? "gerar-nota" : undefined}
              className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-strong disabled:cursor-not-allowed disabled:bg-brand/40 disabled:text-white/80"
            >
              {leaving
                ? "Salvando e abrindo…"
                : initial.status === "draft"
                  ? "Gerar apresentação chinesa"
                  : "Revisar apresentação e republicar"}
            </button>
            {missing.length === 0 && (
              <p id="gerar-nota" className="mt-2 text-sm text-mist">
                Nada é publicado sem sua confirmação.
              </p>
            )}
            {generateNotice && (
              <p role="alert" className="mt-2 text-sm text-coral">
                {generateNotice}
              </p>
            )}
          </section>
        </form>
      </div>

      <aside className="hidden lg:block" aria-label="Prévia da vitrine">
        <div className="sticky top-6">
          <p className="mb-2 text-sm font-medium text-snow">Prévia da vitrine</p>
          <div className="max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-3xl">{showcase}</div>
        </div>
      </aside>

      {/* Barra fixa no celular: estado do salvamento e acesso à prévia. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-night/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <SaveStatus state={save} onRetry={() => void flush()} compact />
          <div className="flex shrink-0 gap-2">
            <SaveButton state={save} onSave={() => void flush()} compact />
            <button
              type="button"
              onClick={() => previewDialog.current?.showModal()}
              className="min-h-11 rounded-lg bg-brand px-4 text-sm font-semibold text-white"
            >
              Ver prévia
            </button>
          </div>
        </div>
      </div>

      <dialog
        ref={previewDialog}
        aria-labelledby="preview-dialog-title"
        className="m-0 h-dvh max-h-none w-full max-w-none bg-night p-0 text-snow"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-night px-4 py-3">
          <h2 id="preview-dialog-title" className="font-semibold">
            Prévia da vitrine
          </h2>
          <button
            type="button"
            onClick={() => previewDialog.current?.close()}
            className="min-h-11 rounded-lg border border-line px-4 text-sm"
            autoFocus
          >
            Fechar
          </button>
        </div>
        <div className="p-4">
          {showcase}
        </div>
      </dialog>
    </div>
  );
}

function SaveStatus({ state, onRetry, compact }: { state: SaveState; onRetry: () => void; compact?: boolean }) {
  let content: React.ReactNode;
  switch (state.kind) {
    case "idle":
      content = null;
      break;
    case "dirty":
      content = <span className="text-mist">Alterações não salvas</span>;
      break;
    case "saving":
      content = <span className="text-snow">Salvando…</span>;
      break;
    case "saved":
      content = <span className="text-mist">Rascunho salvo às {timeFormat.format(state.at)}</span>;
      break;
    case "invalid":
      content = <span className="text-warn">Corrija os campos destacados para salvar</span>;
      break;
    case "conflict":
      content = <span className="text-coral">Salvamento pausado: versão mais nova em outra aba</span>;
      break;
    case "error":
      content = (
        <span className="text-coral">
          {compact ? "Erro ao salvar." : state.message}{" "}
          <button type="button" onClick={onRetry} className="underline underline-offset-2">
            Tentar novamente
          </button>
        </span>
      );
      break;
  }
  return (
    <p role="status" aria-live="polite" className={`min-w-0 text-xs ${compact ? "truncate" : ""}`}>
      {content}
    </p>
  );
}

function SaveButton({ state, onSave, compact }: { state: SaveState; onSave: () => void; compact?: boolean }) {
  const disabled = state.kind === "saving" || state.kind === "conflict";
  return (
    <button
      type="button"
      onClick={onSave}
      disabled={disabled}
      className={`min-h-11 rounded-lg border border-line px-4 text-sm font-medium text-snow hover:border-coral disabled:opacity-50 ${
        compact ? "hidden sm:inline-flex sm:items-center" : ""
      }`}
    >
      Salvar rascunho
    </button>
  );
}
