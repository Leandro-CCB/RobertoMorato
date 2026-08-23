-- ============================================================
-- Tabela de usuários / login do app "Controle PR Morato"
-- Rode isso UMA VEZ no SQL Editor do Supabase (depois de já ter
-- rodado o supabase_setup.sql original).
-- ============================================================

create table if not exists public.roberto_usuarios (
  id          uuid primary key default gen_random_uuid(),
  usuario     text not null unique,
  senha_hash  text not null,           -- SHA-256 da senha (gerado no navegador)
  is_master   boolean not null default false,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.roberto_usuarios enable row level security;

-- Mesmo modelo de confiança do restante do app (chave anônima já tem
-- acesso total às outras tabelas). Aqui liberamos leitura/gravação
-- para a role "anon", pois o front-end faz login/gestão de usuários
-- diretamente com a chave anônima do Supabase.
drop policy if exists "roberto_usuarios_all" on public.roberto_usuarios;
create policy "roberto_usuarios_all"
  on public.roberto_usuarios
  for all
  to anon
  using (true)
  with check (true);

-- ------------------------------------------------------------
-- Usuário MASTER inicial
--   usuário: master
--   senha:   Bertoni@Master2026   (TROQUE assim que entrar pela
--            primeira vez, usando a própria aba "Usuários" do app)
-- O hash abaixo é o SHA-256 dessa senha.
-- ------------------------------------------------------------
insert into public.roberto_usuarios (usuario, senha_hash, is_master, ativo)
values (
  'master',
  'ba2e85e22999d1c8fc0ff34048f180de4479785f49788342ed7c3429371c9eb5',
  true,
  true
)
on conflict (usuario) do nothing;
