-- Ponte Global · 0001 · Lojas, sessões anônimas, produtos (rascunho) e fotos.
--
-- Todo acesso passa pelo servidor da aplicação com a chave secreta. RLS fica
-- ativo sem políticas: as chaves publicáveis (anon/authenticated) não leem nem
-- gravam nada destas tabelas nem do bucket privado de fotos.

-- ---------------------------------------------------------------------------
-- Stores
-- ---------------------------------------------------------------------------
create table public.stores (
  id uuid primary key default gen_random_uuid(),
  -- Origem informada pelo produtor (fonte em português). O perfil público
  -- aprovado da loja chega com a publicação, em migração própria.
  producer_name text check (char_length(producer_name) between 1 and 120),
  city text check (char_length(city) between 1 and 80),
  state char(2) check (state ~ '^[A-Z]{2}$'),
  region text check (char_length(region) between 1 and 80),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Sessão anônima do produtor: o cookie guarda o segredo; aqui fica só o hash.
create table public.store_sessions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index store_sessions_store_id_idx on public.store_sessions (store_id);

-- ---------------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  category text not null default 'cachaca' check (category = 'cachaca'),
  -- Nesta entrega só existe o rascunho. Geração, revisão e publicação
  -- ampliam este conjunto em migração própria.
  status text not null default 'draft' check (status in ('draft')),
  revision integer not null default 1 check (revision > 0),

  -- Fonte em português informada pelo produtor.
  name text check (char_length(name) between 1 and 80),
  brand text check (char_length(brand) between 1 and 80),
  short_description text check (char_length(short_description) between 1 and 400),
  personality text[] not null default '{}' check (cardinality(personality) <= 2),
  -- Atributos da categoria (cachaça): type, volume_ml, abv_percent, wood,
  -- aging_months, aroma, flavor. Validados por Zod na fronteira.
  attributes jsonb not null default '{}'::jsonb check (jsonb_typeof(attributes) = 'object'),
  story text check (char_length(story) between 1 and 2000),
  differentiator text check (char_length(differentiator) between 1 and 600),

  -- Comercial. Preço em centavos inteiros de BRL; nulo = preço sob consulta.
  price_brl_cents bigint check (price_brl_cents between 0 and 100000000),
  min_order_units integer check (min_order_units between 1 and 1000000),
  availability text check (availability in ('pronta_entrega', 'sob_encomenda', 'producao_limitada')),
  notes text check (char_length(notes) between 1 and 1000),

  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (id, store_id),
  constraint products_store_position_key unique (store_id, position) deferrable initially deferred
);
create index products_store_id_idx on public.products (store_id, position);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  store_id uuid not null,
  -- Chave imutável no Storage: stores/{store}/products/{product}/{image}.{ext}
  storage_path text not null unique,
  position smallint not null check (position between 0 and 2), -- 0 = foto principal
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  width integer check (width > 0),
  height integer check (height > 0),
  created_at timestamptz not null default now(),
  foreign key (product_id, store_id) references public.products (id, store_id) on delete cascade,
  constraint product_images_product_position_key unique (product_id, position) deferrable initially deferred
);
create index product_images_store_id_idx on public.product_images (store_id);

-- ---------------------------------------------------------------------------
-- Acesso: somente o servidor (service role / chave secreta).
-- ---------------------------------------------------------------------------
alter table public.stores enable row level security;
alter table public.store_sessions enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;

revoke all on public.stores, public.store_sessions, public.products, public.product_images
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Operações atômicas
-- ---------------------------------------------------------------------------

-- Resolve (ou cria) a loja de um cookie de sessão. O lock evita duas lojas
-- quando a primeira gravação chega em requisições simultâneas.
create function public.ensure_store_session(p_token_hash text)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_store_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('store_session:' || p_token_hash, 0));

  select s.store_id into v_store_id from store_sessions s where s.token_hash = p_token_hash;
  if found then
    update store_sessions set last_seen_at = now() where token_hash = p_token_hash;
    return v_store_id;
  end if;

  insert into stores default values returning id into v_store_id;
  insert into store_sessions (store_id, token_hash) values (v_store_id, p_token_hash);
  return v_store_id;
end;
$$;

-- Cria (p_product_id nulo) ou atualiza o rascunho com comparação de revisão,
-- gravando na mesma transação a origem informada para a loja.
create function public.save_product_draft(
  p_store_id uuid,
  p_product_id uuid,
  p_expected_revision integer,
  p_product jsonb,
  p_store jsonb
)
returns table (id uuid, revision integer, updated_at timestamptz)
language plpgsql
set search_path = public
as $$
declare
  r products;
  v_id uuid;
  v_revision integer;
  v_updated_at timestamptz;
begin
  r := jsonb_populate_record(null::products, p_product);

  if p_product_id is null then
    perform pg_advisory_xact_lock(hashtextextended('store_products:' || p_store_id::text, 0));
    insert into products as p (
      store_id, name, brand, short_description, personality, attributes, story, differentiator,
      price_brl_cents, min_order_units, availability, notes, position
    ) values (
      p_store_id, r.name, r.brand, r.short_description, coalesce(r.personality, '{}'),
      coalesce(r.attributes, '{}'::jsonb), r.story, r.differentiator,
      r.price_brl_cents, r.min_order_units, r.availability, r.notes,
      coalesce((select max(x.position) + 1 from products x where x.store_id = p_store_id), 0)
    )
    returning p.id, p.revision, p.updated_at into v_id, v_revision, v_updated_at;
  else
    update products as p set
      name = r.name,
      brand = r.brand,
      short_description = r.short_description,
      personality = coalesce(r.personality, '{}'),
      attributes = coalesce(r.attributes, '{}'::jsonb),
      story = r.story,
      differentiator = r.differentiator,
      price_brl_cents = r.price_brl_cents,
      min_order_units = r.min_order_units,
      availability = r.availability,
      notes = r.notes,
      revision = p.revision + 1,
      updated_at = now()
    where p.id = p_product_id
      and p.store_id = p_store_id
      and p.revision = p_expected_revision
    returning p.id, p.revision, p.updated_at into v_id, v_revision, v_updated_at;

    if v_id is null then
      if exists (select 1 from products x where x.id = p_product_id and x.store_id = p_store_id) then
        raise exception 'revision_conflict';
      end if;
      raise exception 'product_not_found';
    end if;
  end if;

  update stores as s set
    producer_name = p_store ->> 'producer_name',
    city = p_store ->> 'city',
    state = p_store ->> 'state',
    region = p_store ->> 'region',
    revision = s.revision + 1,
    updated_at = now()
  where s.id = p_store_id
    and (s.producer_name, s.city, s.state, s.region) is distinct from
        (p_store ->> 'producer_name', p_store ->> 'city', (p_store ->> 'state')::char(2), p_store ->> 'region');

  return query select v_id, v_revision, v_updated_at;
end;
$$;

-- Registra uma foto já enviada ao Storage na próxima posição livre (máx. 3).
create function public.add_product_image(
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

  return v_count::smallint;
end;
$$;

-- Remove a foto e compacta as posições. Devolve a chave no Storage para limpeza.
create function public.remove_product_image(p_store_id uuid, p_image_id uuid)
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

  return v_path;
end;
$$;

-- Torna a foto a principal (posição 0), preservando a ordem relativa das demais.
create function public.set_primary_product_image(p_store_id uuid, p_image_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_product_id uuid;
begin
  select i.product_id into v_product_id
  from product_images i where i.id = p_image_id and i.store_id = p_store_id;
  if not found then
    raise exception 'image_not_found';
  end if;

  perform 1 from products p where p.id = v_product_id for update;

  update product_images as i set position = o.new_position
  from (
    select x.id,
      (row_number() over (order by (x.id = p_image_id) desc, x.position) - 1)::smallint as new_position
    from product_images x where x.product_id = v_product_id
  ) o
  where i.id = o.id and i.position <> o.new_position;
end;
$$;

revoke all on function public.ensure_store_session(text) from public, anon, authenticated;
revoke all on function public.save_product_draft(uuid, uuid, integer, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.add_product_image(uuid, uuid, uuid, text, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.remove_product_image(uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_primary_product_image(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ensure_store_session(text) to service_role;
grant execute on function public.save_product_draft(uuid, uuid, integer, jsonb, jsonb) to service_role;
grant execute on function public.add_product_image(uuid, uuid, uuid, text, text, integer, integer, integer) to service_role;
grant execute on function public.remove_product_image(uuid, uuid) to service_role;
grant execute on function public.set_primary_product_image(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Storage: bucket privado de fotos (nome igual a SUPABASE_STORAGE_BUCKET).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
