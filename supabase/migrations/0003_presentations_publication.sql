-- Ponte Global · 0003 · Adaptação chinesa (IA), versões publicadas e link público.
--
-- Três estruturas distintas (CLAUDE.md, regra 3):
--   products      → fonte em português, editável (rascunho).
--   adaptations   → entrada enviada à IA (gravada antes da chamada) e saída validada.
--   presentations → versão aprovada e imutável: escolha do nome, textos e snapshot
--                   dos fatos, preço com a taxa usada e fotos referenciadas.
-- O produto aponta para no máximo uma apresentação pública. A página pública lê
-- só a versão apontada; editar o rascunho não altera o que está no ar.

-- ---------------------------------------------------------------------------
-- Products: estado de publicação, link estável e revisão das fotos
-- ---------------------------------------------------------------------------
alter table public.products drop constraint products_status_check;
alter table public.products
  add constraint products_status_check check (status in ('draft', 'published', 'withdrawn'));

-- Endereço público estável, atribuído na primeira publicação e nunca trocado.
alter table public.products
  add column public_slug text unique check (public_slug ~ '^[a-z0-9]{10}$');

-- As fotos mudam sem passar pelo formulário: revisão própria para detectar
-- alterações pendentes e impedir publicar uma prévia com fotos diferentes.
alter table public.products
  add column media_revision integer not null default 1 check (media_revision > 0);

-- ---------------------------------------------------------------------------
-- Adaptações geradas pela IA (operação 1)
-- ---------------------------------------------------------------------------
create table public.adaptations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  store_id uuid not null,
  status text not null default 'generating' check (status in ('generating', 'ready', 'failed')),
  -- Revisão do rascunho e entrada exata enviada à IA, gravadas antes da chamada.
  source_revision integer not null check (source_revision > 0),
  input jsonb not null check (jsonb_typeof(input) = 'object'),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  -- Saída já validada pelo contrato (Zod + checagem de fatos). Nula se falhou.
  output jsonb check (output is null or jsonb_typeof(output) = 'object'),
  error_code text check (error_code in ('invalid_output', 'provider_error', 'timeout', 'not_configured', 'abandoned')),
  model text,
  prompt_version text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (product_id, store_id) references public.products (id, store_id) on delete cascade,
  unique (id, product_id),
  constraint adaptations_ready_has_output check (status <> 'ready' or output is not null),
  constraint adaptations_failed_has_code check (status <> 'failed' or error_code is not null)
);
create index adaptations_product_idx on public.adaptations (product_id, created_at desc);
-- Uma geração em andamento por produto (impede cliques repetidos em paralelo).
create unique index adaptations_one_generating_idx on public.adaptations (product_id) where status = 'generating';

-- ---------------------------------------------------------------------------
-- Versões aprovadas (imutáveis)
-- ---------------------------------------------------------------------------
create table public.presentations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  store_id uuid not null,
  version integer not null check (version > 0),
  adaptation_id uuid not null,
  choice text not null check (choice in ('fonetica', 'semantica', 'equilibrada', 'original')),
  source_revision integer not null check (source_revision > 0),
  source_media_revision integer not null check (source_media_revision > 0),
  -- Nome escolhido, textos chineses, fatos do cadastro, preço (BRL em centavos,
  -- CNY em fen e taxa usada) e origem. Validado por Zod na fronteira.
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  published_at timestamptz not null default now(),
  foreign key (product_id, store_id) references public.products (id, store_id) on delete cascade,
  foreign key (adaptation_id, product_id) references public.adaptations (id, product_id),
  unique (product_id, version),
  unique (id, product_id)
);

-- Fotos congeladas na versão. A chave no Storage é imutável e não é apagada
-- enquanto alguma versão a referencia, mesmo que saia do rascunho.
create table public.presentation_images (
  presentation_id uuid not null references public.presentations (id) on delete cascade,
  position smallint not null check (position between 0 and 2),
  storage_path text not null,
  width integer check (width > 0),
  height integer check (height > 0),
  primary key (presentation_id, position)
);
create index presentation_images_path_idx on public.presentation_images (storage_path);

-- Ponteiro público: no máximo uma apresentação, sempre do próprio produto.
alter table public.products add column published_presentation_id uuid;
alter table public.products
  add constraint products_published_presentation_fkey
  foreign key (published_presentation_id, id) references public.presentations (id, product_id)
  on delete set null (published_presentation_id);
alter table public.products
  add constraint products_published_has_slug check (published_presentation_id is null or public_slug is not null);

-- ---------------------------------------------------------------------------
-- Registro das chamadas de IA (sem conteúdo do produtor)
-- ---------------------------------------------------------------------------
create table public.ai_calls (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores (id) on delete cascade,
  product_id uuid,
  adaptation_id uuid references public.adaptations (id) on delete cascade,
  operation text not null check (operation in ('identity', 'interpret', 'translate')),
  prompt_version text not null,
  schema_version text not null,
  model text not null,
  attempt smallint not null default 1 check (attempt between 1 and 5),
  status text not null check (status in ('ok', 'invalid_output', 'provider_error', 'timeout', 'not_configured')),
  duration_ms integer not null check (duration_ms >= 0),
  -- Código curto do problema (ex.: caminho do campo inválido), nunca texto gerado.
  detail text check (char_length(detail) <= 300),
  created_at timestamptz not null default now()
);
create index ai_calls_created_idx on public.ai_calls (created_at desc);

alter table public.adaptations enable row level security;
alter table public.presentations enable row level security;
alter table public.presentation_images enable row level security;
alter table public.ai_calls enable row level security;
revoke all on public.adaptations, public.presentations, public.presentation_images, public.ai_calls
  from anon, authenticated;
grant select, insert, update, delete on public.adaptations, public.presentations, public.presentation_images, public.ai_calls
  to service_role;

-- ---------------------------------------------------------------------------
-- Operações atômicas
-- ---------------------------------------------------------------------------

-- Registra a entrada da IA antes da chamada. Recusa revisão diferente da atual
-- e uma segunda geração simultânea; geração presa há mais de 3 minutos (função
-- interrompida) é encerrada como abandonada.
create function public.start_adaptation(
  p_store_id uuid,
  p_product_id uuid,
  p_expected_revision integer,
  p_input jsonb,
  p_input_hash text,
  p_prompt_version text,
  p_model text
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_revision integer;
  v_id uuid;
begin
  select p.revision into v_revision from products p
  where p.id = p_product_id and p.store_id = p_store_id
  for update;
  if not found then
    raise exception 'product_not_found';
  end if;
  if v_revision <> p_expected_revision then
    raise exception 'revision_conflict';
  end if;

  update adaptations set status = 'failed', error_code = 'abandoned', completed_at = now()
  where product_id = p_product_id and status = 'generating' and created_at < now() - interval '3 minutes';

  if exists (select 1 from adaptations a where a.product_id = p_product_id and a.status = 'generating') then
    raise exception 'generation_in_progress';
  end if;

  insert into adaptations (product_id, store_id, source_revision, input, input_hash, prompt_version, model)
  values (p_product_id, p_store_id, p_expected_revision, p_input, p_input_hash, p_prompt_version, p_model)
  returning id into v_id;
  return v_id;
end;
$$;

-- Conclui a geração (só a que ainda está em andamento).
create function public.finish_adaptation(
  p_store_id uuid,
  p_adaptation_id uuid,
  p_output jsonb,
  p_error_code text
)
returns void
language plpgsql
set search_path = public
as $$
begin
  update adaptations set
    status = case when p_output is null then 'failed' else 'ready' end,
    output = p_output,
    error_code = case when p_output is null then p_error_code else null end,
    completed_at = now()
  where id = p_adaptation_id and store_id = p_store_id and status = 'generating';
end;
$$;

-- Publica com confirmação explícita: confere revisão do texto e das fotos,
-- congela a versão e troca o ponteiro na mesma transação. Repetir a mesma
-- confirmação devolve a versão já publicada, sem criar outra.
create function public.publish_presentation(
  p_store_id uuid,
  p_product_id uuid,
  p_adaptation_id uuid,
  p_choice text,
  p_expected_revision integer,
  p_expected_media_revision integer,
  p_snapshot jsonb,
  p_images jsonb,
  p_slug_candidate text
)
returns table (presentation_id uuid, version integer, public_slug text, created boolean)
language plpgsql
set search_path = public
as $$
declare
  v_product products;
  v_current presentations;
  v_slug text;
  v_version integer;
  v_id uuid;
begin
  select * into v_product from products p
  where p.id = p_product_id and p.store_id = p_store_id
  for update;
  if not found then
    raise exception 'product_not_found';
  end if;

  if not exists (
    select 1 from adaptations a
    where a.id = p_adaptation_id and a.product_id = p_product_id and a.status = 'ready'
  ) then
    raise exception 'adaptation_not_ready';
  end if;

  -- Mesma confirmação repetida: devolve a versão no ar.
  if v_product.published_presentation_id is not null then
    select * into v_current from presentations x where x.id = v_product.published_presentation_id;
    if v_current.adaptation_id = p_adaptation_id
      and v_current.choice = p_choice
      and v_current.source_revision = p_expected_revision
      and v_current.source_media_revision = p_expected_media_revision then
      return query select v_current.id, v_current.version, v_product.public_slug, false;
      return;
    end if;
  end if;

  if v_product.revision <> p_expected_revision or v_product.media_revision <> p_expected_media_revision then
    raise exception 'revision_conflict';
  end if;

  v_slug := coalesce(v_product.public_slug, p_slug_candidate);
  select coalesce(max(x.version), 0) + 1 into v_version from presentations x where x.product_id = p_product_id;

  insert into presentations (
    product_id, store_id, version, adaptation_id, choice, source_revision, source_media_revision, snapshot
  ) values (
    p_product_id, p_store_id, v_version, p_adaptation_id, p_choice, p_expected_revision, p_expected_media_revision, p_snapshot
  )
  returning id into v_id;

  insert into presentation_images (presentation_id, position, storage_path, width, height)
  select v_id, (img ->> 'position')::smallint, img ->> 'storage_path',
         nullif(img ->> 'width', '')::integer, nullif(img ->> 'height', '')::integer
  from jsonb_array_elements(p_images) as img;

  update products as p set
    published_presentation_id = v_id,
    public_slug = v_slug,
    status = 'published'
  where p.id = p_product_id;

  return query select v_id, v_version, v_slug, true;
end;
$$;

-- As operações de foto passam a avançar media_revision (mesmas regras da 0001).
create or replace function public.add_product_image(
  p_store_id uuid,
  p_product_id uuid,
  p_image_id uuid,
  p_storage_path text,
  p_content_type text,
  p_size_bytes integer,
  p_width integer,
  p_height integer
)
returns smallint
language plpgsql
set search_path = public
as $$
declare
  v_count integer;
begin
  perform 1 from products p where p.id = p_product_id and p.store_id = p_store_id for update;
  if not found then
    raise exception 'product_not_found';
  end if;

  select count(*) into v_count from product_images i where i.product_id = p_product_id;
  if v_count >= 3 then
    raise exception 'image_limit_reached';
  end if;

  insert into product_images (id, product_id, store_id, storage_path, position, content_type, size_bytes, width, height)
  values (p_image_id, p_product_id, p_store_id, p_storage_path, v_count, p_content_type, p_size_bytes, p_width, p_height);

  update products set media_revision = media_revision + 1 where id = p_product_id;
  return v_count::smallint;
end;
$$;

create or replace function public.remove_product_image(p_store_id uuid, p_image_id uuid)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_product_id uuid;
  v_path text;
begin
  select i.product_id into v_product_id
  from product_images i where i.id = p_image_id and i.store_id = p_store_id;
  if not found then
    raise exception 'image_not_found';
  end if;

  perform 1 from products p where p.id = v_product_id for update;

  delete from product_images i where i.id = p_image_id returning i.storage_path into v_path;

  update product_images as i set position = o.new_position
  from (
    select x.id, (row_number() over (order by x.position) - 1)::smallint as new_position
    from product_images x where x.product_id = v_product_id
  ) o
  where i.id = o.id and i.position <> o.new_position;

  update products set media_revision = media_revision + 1 where id = v_product_id;
  return v_path;
end;
$$;

create or replace function public.set_primary_product_image(p_store_id uuid, p_image_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_product_id uuid;
  v_position smallint;
begin
  select i.product_id, i.position into v_product_id, v_position
  from product_images i where i.id = p_image_id and i.store_id = p_store_id;
  if not found then
    raise exception 'image_not_found';
  end if;

  perform 1 from products p where p.id = v_product_id for update;
  if v_position = 0 then
    return;
  end if;

  update product_images as i set position = o.new_position
  from (
    select x.id,
      (row_number() over (order by (x.id = p_image_id) desc, x.position) - 1)::smallint as new_position
    from product_images x where x.product_id = v_product_id
  ) o
  where i.id = o.id and i.position <> o.new_position;

  update products set media_revision = media_revision + 1 where id = v_product_id;
end;
$$;

revoke all on function public.start_adaptation(uuid, uuid, integer, jsonb, text, text, text) from public, anon, authenticated;
revoke all on function public.finish_adaptation(uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.publish_presentation(uuid, uuid, uuid, text, integer, integer, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.add_product_image(uuid, uuid, uuid, text, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.remove_product_image(uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_primary_product_image(uuid, uuid) from public, anon, authenticated;
grant execute on function public.start_adaptation(uuid, uuid, integer, jsonb, text, text, text) to service_role;
grant execute on function public.finish_adaptation(uuid, uuid, jsonb, text) to service_role;
grant execute on function public.publish_presentation(uuid, uuid, uuid, text, integer, integer, jsonb, jsonb, text) to service_role;
grant execute on function public.add_product_image(uuid, uuid, uuid, text, text, integer, integer, integer) to service_role;
grant execute on function public.remove_product_image(uuid, uuid) to service_role;
grant execute on function public.set_primary_product_image(uuid, uuid) to service_role;
