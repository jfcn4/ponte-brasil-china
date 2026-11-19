-- BAQIAO · 0002 · Privilégios explícitos do servidor.
--
-- Projetos Supabase recentes não concedem DML padrão ao service_role nas novas
-- tabelas. O servidor da aplicação (chave secreta) é o único cliente destas
-- tabelas; anon e authenticated continuam sem acesso.
grant select, insert, update, delete on public.stores, public.store_sessions, public.products, public.product_images
  to service_role;
