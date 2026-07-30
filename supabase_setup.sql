-- ══════════════════════════════════════════════════════════════
--  SUPABASE — Grupo Bertoni PR Morato
--  Migração completa do Firebase/Firestore para Supabase/Postgres
--  Todas as tabelas usam o prefixo roberto_ conforme solicitado.
--
--  Modelo: cada "coleção" do Firestore vira uma tabela com
--  (id text primary key, data jsonb) — igual ao formato de
--  documentos do Firestore, para manter 100% de compatibilidade
--  com o app sem precisar reescrever a lógica de negócio.
--
--  Como usar: cole este script inteiro no SQL Editor do seu
--  projeto Supabase (https://supabase.com/dashboard/project/zfwcvsaaczbsxxfgzdur/sql/new)
--  e clique em "Run".
-- ══════════════════════════════════════════════════════════════

-- ── Extensões úteis ──────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ── Tabela: roberto_lancamentos ──────────────────────────────────
create table if not exists public.roberto_lancamentos (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── Tabela: roberto_cargas ────────────────────────────────────────
create table if not exists public.roberto_cargas (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── Tabela: roberto_config ────────────────────────────────────────
-- Guarda documentos de configuração avulsos, identificados por id:
--   'precos', 'frete', 'empresa_dias', 'prs', 'backup_meta', 'fiado_pagamentos'
create table if not exists public.roberto_config (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── Tabela: roberto_backups ───────────────────────────────────────
-- Cada linha é um backup completo (lançamentos + cargas + config),
-- identificado pelo "label" (ex.: '2026-07-30' ou '2026-07-30_manual').
create table if not exists public.roberto_backups (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── Índices auxiliares (útil se quiser consultar por campos do JSON) ──
create index if not exists idx_roberto_lancamentos_data on public.roberto_lancamentos using gin (data);
create index if not exists idx_roberto_cargas_data       on public.roberto_cargas       using gin (data);

-- ── Trigger para manter updated_at sempre atualizado ──────────────
create or replace function public.roberto_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_roberto_lancamentos_updated on public.roberto_lancamentos;
create trigger trg_roberto_lancamentos_updated
  before update on public.roberto_lancamentos
  for each row execute function public.roberto_set_updated_at();

drop trigger if exists trg_roberto_cargas_updated on public.roberto_cargas;
create trigger trg_roberto_cargas_updated
  before update on public.roberto_cargas
  for each row execute function public.roberto_set_updated_at();

drop trigger if exists trg_roberto_config_updated on public.roberto_config;
create trigger trg_roberto_config_updated
  before update on public.roberto_config
  for each row execute function public.roberto_set_updated_at();

drop trigger if exists trg_roberto_backups_updated on public.roberto_backups;
create trigger trg_roberto_backups_updated
  before update on public.roberto_backups
  for each row execute function public.roberto_set_updated_at();

-- ══════════════════════════════════════════════════════════════
--  RLS (Row Level Security)
--  O app usa apenas a chave "anon" pública, sem login de usuário
--  (mesmo modelo do Firebase original, que usava a API key pública
--  do Firestore). Para o app continuar funcionando exatamente como
--  antes — sem tela de login — habilitamos RLS e liberamos acesso
--  total ao papel "anon".
--
--  ⚠️ Isso significa que qualquer pessoa com a URL + anon key do
--  seu projeto pode ler/gravar nessas tabelas — a mesma exposição
--  que já existia com a API key do Firebase no código-fonte do
--  index.html. Se quiser mais segurança no futuro, o ideal é
--  adicionar autenticação (Supabase Auth) e trocar estas policies
--  por regras que exijam auth.uid().
-- ══════════════════════════════════════════════════════════════

alter table public.roberto_lancamentos enable row level security;
alter table public.roberto_cargas      enable row level security;
alter table public.roberto_config      enable row level security;
alter table public.roberto_backups     enable row level security;

drop policy if exists "anon_full_access" on public.roberto_lancamentos;
create policy "anon_full_access" on public.roberto_lancamentos
  for all to anon using (true) with check (true);

drop policy if exists "anon_full_access" on public.roberto_cargas;
create policy "anon_full_access" on public.roberto_cargas
  for all to anon using (true) with check (true);

drop policy if exists "anon_full_access" on public.roberto_config;
create policy "anon_full_access" on public.roberto_config
  for all to anon using (true) with check (true);

drop policy if exists "anon_full_access" on public.roberto_backups;
create policy "anon_full_access" on public.roberto_backups
  for all to anon using (true) with check (true);

-- ══════════════════════════════════════════════════════════════
--  Pronto! Depois de rodar este script:
--  1. Confira em Table Editor se as 4 tabelas roberto_* foram criadas.
--  2. Publique o novo index.html / sw.js / manifest.json.
--  3. Abra o app: ele vai carregar vazio (tabelas novas), e a cada
--     lançamento/carga salva, os dados vão para o Supabase.
--  4. Se você tinha dados antigos no Firebase e quer importá-los,
--     me envie um export JSON dos dados que eu gero o INSERT.
-- ══════════════════════════════════════════════════════════════
