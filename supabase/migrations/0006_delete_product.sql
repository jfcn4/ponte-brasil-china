-- BAQIAO · 0006 · Exclusão definitiva de produto (limpeza de dados de teste).
--
-- delete_product       → uma transação: confere que o produto é da loja, apaga as
--                        conversas vinculadas (e, em cascata, mensagens e rascunhos de
--                        resposta), o produto (e, em cascata, adaptações, versões e fotos),
--                        compacta a ordem do catálogo e avança a revisão do catálogo.
-- storage_cleanup      → fila de arquivos do Storage a remover. O banco grava a fila na
--                        mesma transação; a aplicação esvazia a fila depois e pode repetir
--                        a limpeza se o Storage falhar.
--
-- Só acrescenta estruturas: a versão anterior da aplicação continua funcionando.

create table public.storage_cleanup (
  storage_path text primary key,
  store_id uuid not null,
  product_id uuid not null,
  attempts integer not null default 0 check (attempts >= 0),
  -- Código curto do erro (nunca conteúdo do produtor).
  last_error text check (char_length(last_error) <= 120),
  created_at timestamptz not null default now()
);
create index storage_cleanup_store_idx on public.storage_cleanup (store_id);

alter table public.storage_cleanup enable row level security;
revoke all on public.storage_cleanup from anon, authenticated;
grant select, insert, update, delete on public.storage_cleanup to service_role;

-- Quantas conversas e mensagens o produto tem (confirmação antes de excluir).
create function public.product_deletion_impact(p_store_id uuid, p_product_id uuid)
returns table (conversation_count integer, message_count integer)
language plpgsql
stable
set search_path = public
as $$
begin
  if not exists (select 1 from products p where p.id = p_product_id and p.store_id = p_store_id) then
    raise exception 'product_not_found';
  end if;
  return query
    select
      (select count(*)::integer from conversations c where c.product_id = p_product_id and c.store_id = p_store_id),
      (select count(*)::integer from messages m join conversations c on c.id = m.conversation_id
        where c.product_id = p_product_id and c.store_id = p_store_id);
end;
$$;

-- Exclusão definitiva. p_expected_conversations (opcional) é o número mostrado ao
-- produtor na confirmação: se mudou (chegou conversa nova), nada é apagado.
-- Repetir a chamada depois de concluída devolve product_not_found.
create function public.delete_product(
  p_store_id uuid,
  p_product_id uuid,
  p_expected_conversations integer
)
returns table (conversation_count integer, message_count integer, storage_paths text[])
language plpgsql
set search_path = public
as $$
declare
  v_conversations integer;
  v_messages integer;
  v_paths text[];
begin
  -- Mesmo lock da criação e da ordenação: a lista de produtos não muda no meio.
  perform pg_advisory_xact_lock(hashtextextended('store_products:' || p_store_id::text, 0));

  perform 1 from products p where p.id = p_product_id and p.store_id = p_store_id for update;
  if not found then
    raise exception 'product_not_found';
  end if;

  select count(*)::integer into v_conversations
  from conversations c where c.product_id = p_product_id and c.store_id = p_store_id;
  if p_expected_conversations is not null and p_expected_conversations <> v_conversations then
    raise exception 'conversations_changed';
  end if;
  select count(*)::integer into v_messages
  from messages m join conversations c on c.id = m.conversation_id
  where c.product_id = p_product_id and c.store_id = p_store_id;

  -- Fotos exclusivas: as do rascunho e as congeladas nas versões, desde que
  -- nenhum outro produto aponte para o mesmo arquivo.
  select coalesce(array_agg(s.path), '{}') into v_paths
  from (
    select i.storage_path as path from product_images i where i.product_id = p_product_id
    union
    select pi.storage_path from presentation_images pi
    join presentations x on x.id = pi.presentation_id where x.product_id = p_product_id
  ) s
  where not exists (select 1 from product_images o where o.storage_path = s.path and o.product_id <> p_product_id)
    and not exists (
      select 1 from presentation_images o join presentations y on y.id = o.presentation_id
      where o.storage_path = s.path and y.product_id <> p_product_id
    );

  insert into storage_cleanup (storage_path, store_id, product_id)
  select unnest(v_paths), p_store_id, p_product_id
  on conflict (storage_path) do nothing;

  -- Conversas primeiro (mensagens e rascunhos de resposta saem em cascata);
  -- depois o produto (adaptações, versões e fotos em cascata).
  delete from conversations c where c.product_id = p_product_id and c.store_id = p_store_id;
  delete from ai_calls a where a.product_id = p_product_id and a.store_id = p_store_id;
  delete from products p where p.id = p_product_id and p.store_id = p_store_id;

  -- Ordem do catálogo sem lacunas; os demais produtos mantêm a ordem salva.
  update products as p set position = r.new_position
  from (
    select x.id, (row_number() over (order by x.position, x.created_at) - 1)::integer as new_position
    from products x where x.store_id = p_store_id
  ) r
  where p.id = r.id and p.position <> r.new_position;

  update stores set catalog_revision = catalog_revision + 1 where id = p_store_id;

  return query select v_conversations, v_messages, v_paths;
end;
$$;

revoke all on function public.product_deletion_impact(uuid, uuid) from public, anon, authenticated;
revoke all on function public.delete_product(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.product_deletion_impact(uuid, uuid) to service_role;
grant execute on function public.delete_product(uuid, uuid, integer) to service_role;
