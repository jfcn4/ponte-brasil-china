-- Ponte Global · 0005 · Loja pública: endereço estável, perfil aprovado e ordem do catálogo.
--
-- stores.public_slug     → endereço do catálogo (/l/<código>), atribuído na primeira
--                          publicação de um produto e nunca trocado.
-- stores.public_profile  → cópia aprovada do produtor e da origem, tirada do snapshot
--                          da versão publicada mais recente (só campos aprovados).
-- stores.intro           → apresentação chinesa da loja aprovada pelo produtor
--                          ({zh, pt, adaptation_id, approved_at}).
-- stores.catalog_revision → comparação de revisão da ordem dos produtos.
--
-- Só acrescenta estruturas: a versão anterior da aplicação continua funcionando.
-- A assinatura de publish_presentation não muda.

alter table public.stores
  add column public_slug text unique check (public_slug ~ '^[a-z0-9]{10}$'),
  add column public_profile jsonb check (public_profile is null or jsonb_typeof(public_profile) = 'object'),
  add column intro jsonb check (intro is null or jsonb_typeof(intro) = 'object'),
  add column catalog_revision integer not null default 1 check (catalog_revision > 0),
  add column published_at timestamptz;

alter table public.stores
  add constraint stores_public_has_profile check (public_slug is null or public_profile is not null);

-- Leitura do catálogo: produtos publicados da loja, na ordem.
create index products_store_published_idx on public.products (store_id, position)
  where published_presentation_id is not null;

-- ---------------------------------------------------------------------------
-- Código do endereço público (mesmo alfabeto dos produtos, sem 0/1/l/o).
-- ---------------------------------------------------------------------------
create function public.new_public_slug()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_alphabet constant text := 'abcdefghijkmnpqrstuvwxyz23456789';
  v_bytes bytea;
  v_slug text := '';
  v_index integer;
begin
  -- 16 bytes aleatórios de gen_random_uuid (núcleo do PostgreSQL); os bytes de
  -- versão e variante (6 e 8) ficam de fora.
  v_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  foreach v_index in array array[0, 1, 2, 3, 4, 5, 10, 11, 12, 13] loop
    v_slug := v_slug || substr(v_alphabet, (get_byte(v_bytes, v_index) % 32) + 1, 1);
  end loop;
  return v_slug;
end;
$$;

-- ---------------------------------------------------------------------------
-- Publicação: a primeira versão publicada também abre a loja (mesma transação).
-- Mesma assinatura e mesmas regras da 0003; acrescenta só o bloco da loja.
-- ---------------------------------------------------------------------------
create or replace function public.publish_presentation(
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

  -- Loja: endereço estável na primeira publicação; perfil público = produtor
  -- e origem aprovados nesta versão.
  update stores as s set
    public_slug = coalesce(s.public_slug, new_public_slug()),
    public_profile = p_snapshot -> 'producer',
    published_at = coalesce(s.published_at, now())
  where s.id = p_store_id;

  return query select v_id, v_version, v_slug, true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ordem do catálogo: aplicada em conjunto, com comparação de revisão.
-- Recebe todos os produtos da loja (rascunhos inclusive) na nova ordem.
-- Repetir a mesma ordem devolve a revisão atual sem gravar de novo.
-- ---------------------------------------------------------------------------
create function public.reorder_products(
  p_store_id uuid,
  p_product_ids uuid[],
  p_expected_revision integer
)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_revision integer;
  v_current uuid[];
begin
  -- Mesmo lock da criação de produto: a lista não muda no meio da troca.
  perform pg_advisory_xact_lock(hashtextextended('store_products:' || p_store_id::text, 0));

  select s.catalog_revision into v_revision from stores s where s.id = p_store_id for update;
  if not found then
    raise exception 'store_not_found';
  end if;

  select coalesce(array_agg(p.id order by p.position, p.created_at), '{}') into v_current
  from products p where p.store_id = p_store_id;

  if v_current = p_product_ids then
    return v_revision;
  end if;

  if cardinality(p_product_ids) <> cardinality(v_current)
    or (select count(distinct x) from unnest(p_product_ids) as x) <> cardinality(v_current)
    or exists (select 1 from unnest(p_product_ids) as x where x <> all (v_current)) then
    raise exception 'order_mismatch';
  end if;

  if v_revision <> p_expected_revision then
    raise exception 'revision_conflict';
  end if;

  -- Restrição (store_id, position) é adiada: trocas não colidem no meio.
  update products as p set position = (o.ord - 1)::integer
  from unnest(p_product_ids) with ordinality as o(id, ord)
  where p.id = o.id and p.store_id = p_store_id and p.position <> o.ord - 1;

  update stores set catalog_revision = catalog_revision + 1 where id = p_store_id
  returning catalog_revision into v_revision;
  return v_revision;
end;
$$;

-- ---------------------------------------------------------------------------
-- Apresentação chinesa da loja: aprovação explícita do texto gerado junto com
-- a adaptação de um produto desta loja. Repetir a aprovação não muda nada.
-- ---------------------------------------------------------------------------
create function public.approve_store_intro(p_store_id uuid, p_adaptation_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_intro jsonb;
  v_current jsonb;
begin
  select a.output -> 'store_intro' into v_intro
  from adaptations a
  where a.id = p_adaptation_id and a.store_id = p_store_id and a.status = 'ready';
  if not found then
    raise exception 'adaptation_not_ready';
  end if;
  if v_intro is null or jsonb_typeof(v_intro) <> 'object' or v_intro ->> 'zh' is null or v_intro ->> 'pt' is null then
    raise exception 'intro_missing';
  end if;

  select s.intro into v_current from stores s where s.id = p_store_id for update;
  if not found then
    raise exception 'store_not_found';
  end if;
  if v_current ->> 'adaptation_id' = p_adaptation_id::text then
    return v_current;
  end if;

  update stores set intro = jsonb_build_object(
      'zh', v_intro ->> 'zh',
      'pt', v_intro ->> 'pt',
      'adaptation_id', p_adaptation_id,
      'approved_at', now()
    )
  where id = p_store_id
  returning intro into v_current;
  return v_current;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lojas que já tinham produto publicado antes desta migração.
-- ---------------------------------------------------------------------------
with latest as (
  select distinct on (x.store_id) x.store_id, x.snapshot -> 'producer' as producer, x.published_at
  from presentations x
  join products p on p.published_presentation_id = x.id
  order by x.store_id, x.published_at desc
)
update stores as s set
  public_slug = new_public_slug(),
  public_profile = l.producer,
  published_at = l.published_at
from latest l
where s.id = l.store_id and s.public_slug is null;

revoke all on function public.new_public_slug() from public, anon, authenticated;
revoke all on function public.publish_presentation(uuid, uuid, uuid, text, integer, integer, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.reorder_products(uuid, uuid[], integer) from public, anon, authenticated;
revoke all on function public.approve_store_intro(uuid, uuid) from public, anon, authenticated;
grant execute on function public.new_public_slug() to service_role;
grant execute on function public.publish_presentation(uuid, uuid, uuid, text, integer, integer, jsonb, jsonb, text) to service_role;
grant execute on function public.reorder_products(uuid, uuid[], integer) to service_role;
grant execute on function public.approve_store_intro(uuid, uuid) to service_role;
