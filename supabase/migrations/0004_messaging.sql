-- Ponte Global · 0004 · Conversas comerciais (consulta do comprador e resposta revisada).
--
-- conversations → loja, produto e versão publicada que o comprador abriu, mais
--                 o hash do segredo do link privado (o segredo nunca é gravado).
-- messages      → original como foi escrito, idioma, tradução e análise da IA
--                 (operação 2) para entradas do comprador; resposta aprovada em
--                 português e sua tradução confirmada (operação 3) para o produtor.
-- reply_drafts  → texto em português ainda não enviado e a prévia de tradução
--                 presa à revisão exata desse texto.
-- O comprador só vê mensagens do produtor depois de send_reply.

-- ---------------------------------------------------------------------------
-- Conversas
-- ---------------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  product_id uuid not null,
  -- Versão vista pelo comprador ao iniciar a consulta. Não muda ao republicar.
  presentation_id uuid not null,
  presentation_version integer not null check (presentation_version > 0),
  buyer_token_hash text not null unique check (buyer_token_hash ~ '^[0-9a-f]{64}$'),
  buyer_name text check (char_length(buyer_name) between 1 and 80),
  buyer_company text check (char_length(buyer_company) between 1 and 120),
  -- Idioma em que o produtor responde (o da entrada mais recente do comprador).
  reply_lang text not null check (reply_lang in ('zh-Hans', 'en')),
  last_seq integer not null default 0 check (last_seq >= 0),
  last_buyer_seq integer not null default 0 check (last_buyer_seq >= 0),
  last_producer_seq integer not null default 0 check (last_producer_seq >= 0),
  -- Última entrada do comprador efetivamente exibida ao produtor.
  producer_read_seq integer not null default 0 check (producer_read_seq >= 0),
  has_unread boolean generated always as (last_buyer_seq > producer_read_seq) stored,
  awaiting_reply boolean generated always as (last_buyer_seq > last_producer_seq) stored,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (product_id, store_id) references public.products (id, store_id) on delete cascade,
  foreign key (presentation_id, product_id) references public.presentations (id, product_id),
  unique (id, store_id)
);
create index conversations_store_idx on public.conversations (store_id, last_message_at desc);

-- ---------------------------------------------------------------------------
-- Mensagens
-- ---------------------------------------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  store_id uuid not null,
  seq integer not null check (seq > 0),
  author text not null check (author in ('buyer', 'producer')),
  -- Texto como o autor escreveu (comprador: idioma dele; produtor: português).
  body text not null check (char_length(body) between 1 and 4000),
  body_lang text not null check (body_lang in ('zh-Hans', 'en', 'pt-BR', 'other')),
  -- Comprador: tradução em português. Produtor: tradução confirmada no idioma da conversa.
  translation text check (char_length(translation) between 1 and 8000),
  translation_lang text check (translation_lang in ('zh-Hans', 'en', 'pt-BR')),
  -- Análise da operação 2 (só para o produtor; nunca sai na API do comprador).
  analysis jsonb check (analysis is null or jsonb_typeof(analysis) = 'object'),
  interpretation_status text check (interpretation_status in ('pending', 'interpreting', 'ready', 'failed')),
  interpretation_error text check (interpretation_error in ('invalid_output', 'provider_error', 'timeout', 'not_configured')),
  interpretation_model text,
  interpretation_started_at timestamptz,
  -- Chave de idempotência do envio (comprador: gerada no navegador; produtor: id do rascunho).
  client_key uuid not null,
  reply_draft_id uuid unique,
  created_at timestamptz not null default now(),
  foreign key (conversation_id, store_id) references public.conversations (id, store_id) on delete cascade,
  unique (conversation_id, seq),
  unique (conversation_id, client_key),
  constraint messages_buyer_shape check (
    author <> 'buyer' or (interpretation_status is not null and reply_draft_id is null)
  ),
  constraint messages_producer_shape check (
    author <> 'producer' or (
      interpretation_status is null and body_lang = 'pt-BR' and translation is not null
      and translation_lang is not null and reply_draft_id is not null
    )
  ),
  constraint messages_ready_has_translation check (interpretation_status is distinct from 'ready' or translation is not null)
);
create index messages_conversation_idx on public.messages (conversation_id, seq);

-- ---------------------------------------------------------------------------
-- Rascunho da resposta (um aberto por conversa)
-- ---------------------------------------------------------------------------
create table public.reply_drafts (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  store_id uuid not null,
  body text not null check (char_length(body) between 1 and 4000),
  revision integer not null default 1 check (revision > 0),
  translation_status text not null default 'none'
    check (translation_status in ('none', 'translating', 'ready', 'failed')),
  -- Revisão do texto a que a tradução pertence. Editar o texto invalida a prévia.
  translation_revision integer,
  translation text check (char_length(translation) between 1 and 8000),
  translation_lang text check (translation_lang in ('zh-Hans', 'en')),
  translation_warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(translation_warnings) = 'array'),
  translation_error text check (translation_error in ('invalid_output', 'provider_error', 'timeout', 'not_configured')),
  translation_model text,
  translation_started_at timestamptz,
  sent_message_id uuid references public.messages (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (conversation_id, store_id) references public.conversations (id, store_id) on delete cascade,
  constraint reply_drafts_ready_shape check (
    translation_status <> 'ready' or (translation is not null and translation_lang is not null and translation_revision is not null)
  )
);
create unique index reply_drafts_one_open_idx on public.reply_drafts (conversation_id) where sent_message_id is null;

-- Registro das chamadas de IA das operações 2 e 3.
alter table public.ai_calls
  add column conversation_id uuid references public.conversations (id) on delete cascade;

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.reply_drafts enable row level security;
revoke all on public.conversations, public.messages, public.reply_drafts from anon, authenticated;
grant select, insert, update, delete on public.conversations, public.messages, public.reply_drafts to service_role;

-- ---------------------------------------------------------------------------
-- Operações atômicas
-- ---------------------------------------------------------------------------

-- Inicia a conversa a partir da vitrine. Confere que a versão vista ainda é a
-- publicada; grava o original antes de qualquer chamada de IA. Repetir o mesmo
-- envio (mesmo segredo e mesma chave) devolve a conversa já criada.
create function public.start_conversation(
  p_slug text,
  p_presentation_version integer,
  p_token_hash text,
  p_body text,
  p_body_lang text,
  p_reply_lang text,
  p_buyer_name text,
  p_buyer_company text,
  p_client_key uuid
)
returns table (conversation_id uuid, message_id uuid, created boolean)
language plpgsql
set search_path = public
as $$
declare
  v_product products;
  v_version integer;
  v_conversation conversations;
  v_message_id uuid;
begin
  select * into v_product from products p where p.public_slug = p_slug for share;
  if not found then
    raise exception 'product_not_found';
  end if;

  select c.* into v_conversation from conversations c where c.buyer_token_hash = p_token_hash;
  if found then
    select m.id into v_message_id from messages m
    where m.conversation_id = v_conversation.id and m.seq = 1 and m.client_key = p_client_key;
    if v_message_id is null or v_conversation.product_id <> v_product.id then
      raise exception 'token_conflict';
    end if;
    return query select v_conversation.id, v_message_id, false;
    return;
  end if;

  if v_product.published_presentation_id is null then
    raise exception 'product_unavailable';
  end if;
  select x.version into v_version from presentations x where x.id = v_product.published_presentation_id;
  if v_version is distinct from p_presentation_version then
    raise exception 'version_changed';
  end if;

  insert into conversations (
    store_id, product_id, presentation_id, presentation_version, buyer_token_hash,
    buyer_name, buyer_company, reply_lang, last_seq, last_buyer_seq
  ) values (
    v_product.store_id, v_product.id, v_product.published_presentation_id, v_version, p_token_hash,
    p_buyer_name, p_buyer_company, p_reply_lang, 1, 1
  )
  returning * into v_conversation;

  insert into messages (conversation_id, store_id, seq, author, body, body_lang, interpretation_status, client_key)
  values (v_conversation.id, v_conversation.store_id, 1, 'buyer', p_body, p_body_lang, 'pending', p_client_key)
  returning id into v_message_id;

  return query select v_conversation.id, v_message_id, true;
end;
$$;

-- Nova entrada do comprador pelo link privado. Idempotente pela chave do envio.
create function public.add_buyer_message(
  p_token_hash text,
  p_body text,
  p_body_lang text,
  p_reply_lang text,
  p_client_key uuid
)
returns table (conversation_id uuid, message_id uuid, created boolean)
language plpgsql
set search_path = public
as $$
declare
  v_conversation conversations;
  v_message_id uuid;
  v_seq integer;
begin
  select c.* into v_conversation from conversations c where c.buyer_token_hash = p_token_hash for update;
  if not found then
    raise exception 'conversation_not_found';
  end if;

  select m.id into v_message_id from messages m
  where m.conversation_id = v_conversation.id and m.client_key = p_client_key;
  if found then
    return query select v_conversation.id, v_message_id, false;
    return;
  end if;

  if v_conversation.last_seq >= 200 then
    raise exception 'conversation_full';
  end if;

  v_seq := v_conversation.last_seq + 1;
  insert into messages (conversation_id, store_id, seq, author, body, body_lang, interpretation_status, client_key)
  values (v_conversation.id, v_conversation.store_id, v_seq, 'buyer', p_body, p_body_lang, 'pending', p_client_key)
  returning id into v_message_id;

  update conversations set
    last_seq = v_seq,
    last_buyer_seq = v_seq,
    reply_lang = p_reply_lang,
    last_message_at = now()
  where id = v_conversation.id;

  return query select v_conversation.id, v_message_id, true;
end;
$$;

-- Reserva a interpretação de uma entrada (evita duas chamadas simultâneas).
-- Uma reserva presa há mais de 2 minutos (função interrompida) pode ser retomada.
create function public.claim_interpretation(p_store_id uuid, p_message_id uuid, p_model text)
returns boolean
language plpgsql
set search_path = public
as $$
begin
  update messages set
    interpretation_status = 'interpreting',
    interpretation_started_at = now(),
    interpretation_model = p_model
  where id = p_message_id
    and store_id = p_store_id
    and author = 'buyer'
    and (
      interpretation_status in ('pending', 'failed')
      or (interpretation_status = 'interpreting' and interpretation_started_at < now() - interval '2 minutes')
    );
  return found;
end;
$$;

-- Marca como lidas as entradas do comprador até a última exibida ao produtor.
create function public.mark_conversation_read(p_store_id uuid, p_conversation_id uuid, p_up_to_seq integer)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_read integer;
begin
  update conversations set producer_read_seq = greatest(producer_read_seq, least(p_up_to_seq, last_seq))
  where id = p_conversation_id and store_id = p_store_id
  returning producer_read_seq into v_read;
  if not found then
    raise exception 'conversation_not_found';
  end if;
  return v_read;
end;
$$;

-- Grava o texto em português da resposta. Mudança no texto avança a revisão
-- e descarta a prévia de tradução anterior. Texto igual mantém a prévia.
create function public.save_reply_draft(
  p_store_id uuid,
  p_conversation_id uuid,
  p_expected_revision integer,
  p_body text
)
returns setof reply_drafts
language plpgsql
set search_path = public
as $$
declare
  v_draft reply_drafts;
begin
  perform 1 from conversations c where c.id = p_conversation_id and c.store_id = p_store_id for update;
  if not found then
    raise exception 'conversation_not_found';
  end if;

  select * into v_draft from reply_drafts d
  where d.conversation_id = p_conversation_id and d.sent_message_id is null
  for update;

  if not found then
    if p_expected_revision is not null then
      -- O rascunho esperado já foi enviado (ou removido) em outra aba.
      raise exception 'revision_conflict';
    end if;
    insert into reply_drafts (conversation_id, store_id, body)
    values (p_conversation_id, p_store_id, p_body)
    returning * into v_draft;
    return next v_draft;
    return;
  end if;

  if v_draft.body = p_body then
    return next v_draft;
    return;
  end if;
  if p_expected_revision is distinct from v_draft.revision then
    raise exception 'revision_conflict';
  end if;

  update reply_drafts set
      body = p_body,
      revision = revision + 1,
      translation_status = 'none',
      translation_revision = null,
      translation = null,
      translation_lang = null,
      translation_warnings = '[]'::jsonb,
      translation_error = null,
      translation_started_at = null,
      updated_at = now()
    where id = v_draft.id
    returning * into v_draft;
  return next v_draft;
end;
$$;

-- Reserva a tradução da revisão informada. Devolve falso se o texto mudou,
-- se a mesma revisão já está traduzida ou se outra tradução está em andamento.
create function public.claim_reply_translation(p_store_id uuid, p_draft_id uuid, p_revision integer, p_model text)
returns boolean
language plpgsql
set search_path = public
as $$
begin
  update reply_drafts set
    translation_status = 'translating',
    translation_started_at = now(),
    translation_error = null,
    translation_model = p_model
  where id = p_draft_id
    and store_id = p_store_id
    and sent_message_id is null
    and revision = p_revision
    and (
      translation_status in ('none', 'failed')
      or (translation_status = 'translating' and translation_started_at < now() - interval '2 minutes')
    );
  return found;
end;
$$;

-- Conclui a tradução só se o texto ainda está na mesma revisão (retorno
-- obsoleto é descartado).
create function public.finish_reply_translation(
  p_store_id uuid,
  p_draft_id uuid,
  p_revision integer,
  p_translation text,
  p_translation_lang text,
  p_warnings jsonb,
  p_error text
)
returns boolean
language plpgsql
set search_path = public
as $$
begin
  update reply_drafts set
    translation_status = case when p_translation is null then 'failed' else 'ready' end,
    translation_revision = case when p_translation is null then null else p_revision end,
    translation = p_translation,
    translation_lang = p_translation_lang,
    translation_warnings = coalesce(p_warnings, '[]'::jsonb),
    translation_error = case when p_translation is null then p_error else null end,
    updated_at = now()
  where id = p_draft_id
    and store_id = p_store_id
    and revision = p_revision
    and translation_status = 'translating'
    and sent_message_id is null;
  return found;
end;
$$;

-- Envio confirmado: grava original e tradução revisada numa transação. Repetir
-- a confirmação do mesmo rascunho devolve a mensagem já enviada.
create function public.send_reply(
  p_store_id uuid,
  p_conversation_id uuid,
  p_draft_id uuid,
  p_expected_revision integer
)
returns table (message_id uuid, seq integer, created boolean)
language plpgsql
set search_path = public
as $$
declare
  v_conversation conversations;
  v_draft reply_drafts;
  v_seq integer;
  v_message_id uuid;
begin
  select * into v_conversation from conversations c
  where c.id = p_conversation_id and c.store_id = p_store_id
  for update;
  if not found then
    raise exception 'conversation_not_found';
  end if;

  select * into v_draft from reply_drafts d
  where d.id = p_draft_id and d.conversation_id = p_conversation_id
  for update;
  if not found then
    raise exception 'draft_not_found';
  end if;

  if v_draft.sent_message_id is not null then
    return query select m.id, m.seq, false from messages m where m.id = v_draft.sent_message_id;
    return;
  end if;

  if v_draft.revision <> p_expected_revision then
    raise exception 'revision_conflict';
  end if;
  if v_draft.translation_status <> 'ready' or v_draft.translation_revision is distinct from v_draft.revision then
    raise exception 'translation_stale';
  end if;

  v_seq := v_conversation.last_seq + 1;
  insert into messages (
    conversation_id, store_id, seq, author, body, body_lang, translation, translation_lang, client_key, reply_draft_id
  ) values (
    p_conversation_id, p_store_id, v_seq, 'producer', v_draft.body, 'pt-BR', v_draft.translation,
    v_draft.translation_lang, v_draft.id, v_draft.id
  )
  returning id into v_message_id;

  update reply_drafts set sent_message_id = v_message_id, updated_at = now() where id = v_draft.id;
  update conversations set
    last_seq = v_seq,
    last_producer_seq = v_seq,
    -- Quem responde já viu tudo o que veio antes da resposta.
    producer_read_seq = greatest(producer_read_seq, v_conversation.last_seq),
    last_message_at = now()
  where id = p_conversation_id;

  return query select v_message_id, v_seq, true;
end;
$$;

revoke all on function public.start_conversation(text, integer, text, text, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.add_buyer_message(text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.claim_interpretation(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.mark_conversation_read(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.save_reply_draft(uuid, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.claim_reply_translation(uuid, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.finish_reply_translation(uuid, uuid, integer, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.send_reply(uuid, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.start_conversation(text, integer, text, text, text, text, text, text, uuid) to service_role;
grant execute on function public.add_buyer_message(text, text, text, text, uuid) to service_role;
grant execute on function public.claim_interpretation(uuid, uuid, text) to service_role;
grant execute on function public.mark_conversation_read(uuid, uuid, integer) to service_role;
grant execute on function public.save_reply_draft(uuid, uuid, integer, text) to service_role;
grant execute on function public.claim_reply_translation(uuid, uuid, integer, text) to service_role;
grant execute on function public.finish_reply_translation(uuid, uuid, integer, text, text, jsonb, text) to service_role;
grant execute on function public.send_reply(uuid, uuid, uuid, integer) to service_role;
