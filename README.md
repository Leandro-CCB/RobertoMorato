# Grupo Bertoni — Controle PR Morato (Vite + Login)

App migrado para um projeto **Vite**, agora com **tela de login** protegendo
o acesso, um **usuário master** e uma aba **"Usuários"** (visível somente
para o master) para cadastrar/editar/desativar/excluir usuários.

## 1. Instalar e rodar localmente

```bash
npm install
npm run dev       # ambiente de desenvolvimento (http://localhost:5173)
npm run build     # gera a pasta dist/ pronta para publicar
npm run preview   # testa o build de produção localmente
```

## 2. Configurar o banco (Supabase)

Rode os scripts SQL **nesta ordem**, no SQL Editor do Supabase:

1. `supabase_setup.sql` — cria as tabelas originais do app
   (`roberto_lancamentos`, `roberto_cargas`, `roberto_config`,
   `roberto_backups`, etc.).
2. `import_backup_2026-07-30.sql` — importa o backup antigo (se quiser).
3. **`security_setup.sql`** (novo) — cria a tabela `roberto_usuarios`
   usada pelo login, e já cadastra o usuário master:
   - **usuário:** `master`
   - **senha:** `Bertoni@Master2026`

   ⚠️ **Troque essa senha assim que entrar pela primeira vez**, usando a
   própria aba "Usuários" → ícone 🔑 no seu usuário master.

## 3. Como funciona o login

- Ao abrir o app, aparece a tela de login. Sem usuário/senha válidos
  (cadastrados na tabela `roberto_usuarios`), o conteúdo não é exibido.
- A sessão fica salva no navegador por até 12h (ou até você marcar
  "Manter conectado", que grava em `localStorage` em vez de
  `sessionStorage`).
- Usuários com `is_master = true` veem a aba extra **👤 Usuários**, onde
  podem:
  - Cadastrar novos usuários (usuário + senha, com ou sem acesso master);
  - Redefinir senha de qualquer usuário;
  - Ativar/desativar um usuário (login bloqueado quando inativo);
  - Excluir um usuário.
- As senhas nunca são gravadas em texto puro: o navegador calcula um
  hash SHA-256 antes de enviar/comparar com o banco.

### ⚠️ Importante sobre segurança

Este continua sendo um app 100% front-end (sem servidor próprio) — a
chave anônima do Supabase permanece embutida no código, como já
acontecia no projeto original. A tela de login impede que qualquer
pessoa **abra e use o app** sem credenciais, mas **não substitui** uma
segurança de backend completa (isso exigiria Supabase Auth "de
verdade" + Row Level Security por usuário no banco). Para o uso interno
da empresa, esse nível de proteção já resolve bem o problema de "alguém
achar o link e mexer no sistema sem permissão".

## 4. Publicar (GitHub Pages, Vercel, Netlify, etc.)

Depois de `npm run build`, publique o conteúdo da pasta `dist/`. Se for
usar GitHub Pages, configure a Action de build do Vite ou suba o
conteúdo de `dist/` para a branch/pasta usada pelo Pages.

## Estrutura do projeto

```
morato-app/
├── index.html              # app inteiro (login + telas) — entrada do Vite
├── public/
│   ├── icons/               # ícones do PWA
│   ├── logo.png
│   ├── manifest.json
│   └── sw.js                 # service worker (PWA/offline)
├── supabase_setup.sql        # tabelas originais do app
├── security_setup.sql        # tabela de usuários + usuário master (NOVO)
├── import_backup_2026-07-30.sql
└── package.json
```
