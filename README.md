# Grupo Bertoni — Controle PR Morato

App migrado do Firebase para Supabase. Pronto para publicar no GitHub Pages.

## Como publicar no GitHub

1. Crie um repositório novo no GitHub (pode ser privado).
2. Suba todos os arquivos desta pasta para a raiz do repositório
   (`index.html`, `sw.js`, `manifest.json`, e a pasta `icons/`).
3. No repositório, vá em **Settings → Pages**.
4. Em "Source", escolha a branch (geralmente `main`) e a pasta `/ (root)`.
5. Salve. Em alguns minutos o GitHub te dá uma URL tipo
   `https://SEU_USUARIO.github.io/NOME_DO_REPO/`.
6. Abra essa URL — **não abra o `index.html` clicando duas vezes no
   arquivo**, pois isso usa `file://` e o navegador bloqueia a conexão
   com o Supabase (erro de CORS). Precisa ser acessado por `http://`
   ou `https://` (o GitHub Pages já resolve isso).

## ⚠️ Ícones do PWA

O `manifest.json` referencia ícones em `icons/icon-72.png` até
`icons/icon-512.png`. Esses arquivos de imagem **não foram enviados**
no projeto original, então a pasta `icons/` está vazia neste pacote.
Sem eles, o app funciona normalmente no navegador, mas o ícone de
"instalar como app" (PWA) pode não aparecer corretamente. Se quiser,
gere um ícone quadrado (ex: 512x512) e crie as versões nos tamanhos
listados no `manifest.json`, salvando dentro da pasta `icons/`.

## Banco de dados (Supabase)

- `supabase_setup.sql` — roda uma vez no SQL Editor do Supabase para
  criar as tabelas `roberto_lancamentos`, `roberto_cargas`,
  `roberto_config` e `roberto_backups`.
- `import_backup_2026-07-30.sql` — importa o backup específico que
  você já tinha do Firebase (2070 lançamentos, 75 cargas, preços,
  frete e dias por empresa). Rode depois do `supabase_setup.sql`,
  uma única vez (ou quantas vezes quiser — ele não duplica dados).

As credenciais do Supabase (URL + chave anônima) já estão embutidas
dentro do `index.html`.
