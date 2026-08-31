# Grupo Bertoni — Controle PR Morato (React + Vite)

Migração do app original (um único `index.html` monolítico com ~7.900 linhas
de JS/HTML/CSS misturados) para **React + Vite**, mantendo **estrutura e
lógica idênticas** ao original.

## Como rodar

```bash
npm install
npm run dev       # desenvolvimento (http://localhost:5173)
npm run build     # gera a pasta dist/ para produção
npm run preview   # serve a build de produção localmente
```

## Estrutura do projeto

```
index.html                 -> shell HTML (CDNs do Chart.js/Supabase + scripts legados + <div id="root">)
src/
  main.jsx                 -> ponto de entrada React
  App.jsx                  -> monta AuthGate + AppHeader + todas as abas + BackupModal
  styles/legacy.css         -> todo o CSS original, sem alterações
  components/
    AuthGate.jsx            -> tela de login (aba de acesso)
    AppHeader.jsx            -> cabeçalho com os botões das abas
    TabLancamento.jsx        -> aba "Lançamento"
    TabResumo.jsx             -> aba "Resumo"
    TabCargas.jsx              -> aba "Cargas"
    TabEstoque.jsx              -> aba "Estoque"
    TabMargem.jsx                -> aba "Margem"
    TabFiado.jsx                  -> aba "Fiado"
    TabDeposito.jsx                -> aba "Depósito Bancário"
    TabConfig.jsx                    -> aba "Config"
    TabUsuarios.jsx                    -> aba "Usuários" (somente master)
    BackupModal.jsx                      -> modal de backup/restauração
public/
  legacy/                    -> os módulos JS ORIGINAIS (inalterados na lógica), divididos por responsabilidade:
    01_head_globals.js        -> hojeLocal() e showTab()
    02_supabase_module.js      -> camada de dados (Supabase: coleções, backups, cache)
    03_auth_module.js           -> login, sessão, gestão de usuários
    04_offline_sync.js           -> fila de sincronização offline (localStorage)
    05_security_indexeddb.js      -> snapshots locais de segurança (IndexedDB)
    06_core_logic.js               -> TODA a lógica de negócio original (render de cada
                                       aba, cálculos de margem/fiado/estoque, gráficos
                                       Chart.js, modais, PRS, clientes etc.)
  manifest.json, sw.js, icons/, logo.png -> PWA (idêntico ao original)
```

## Por que esse formato (e não uma reescrita 100% "React idiomático")

O app original guarda **todo o estado da aplicação em variáveis globais**
(`window._lancamentos`, `window._cargas`, `window._configPrecos` etc.) e
manipula o DOM diretamente (`document.getElementById`, `showTab()`,
`innerHTML`), com uma fila própria de sincronização offline e backup local.
Reescrever isso do zero em `useState`/`useReducer` seria uma reformulação
completa da aplicação, com alto risco de introduzir bugs sutis na
sincronização com o Supabase, no cache offline e no cálculo financeiro.

Para cumprir "estrutura e lógica idênticas" com segurança, a migração:

1. Preserva **os módulos de lógica originais inalterados**, apenas
   reorganizados em arquivos separados (`public/legacy/*.js`), carregados
   como `<script>` clássicos — exatamente como no `index.html` original.
2. Preserva **o HTML de cada aba 1:1** (mesmos `id`s, mesmos `onclick`,
   mesmas classes), agora dentro de um componente `.jsx` próprio por aba.
3. O React só é responsável por **montar essa marcação na tela**; a troca
   de aba continua sendo feita pela função global `showTab()` (a mesma de
   sempre), e cada aba dispara seu próprio `renderX()` do jeito que sempre
   disparou.

Na prática: é o mesmo app, agora com Vite como bundler/dev-server e cada aba
isolada em seu próprio arquivo `.jsx`, em vez de um único HTML gigante.

## O que foi testado neste ambiente

- ✅ `npm install` e `npm run build` completam sem erros (Vite + esbuild).
- ✅ Todos os 6 arquivos em `public/legacy/` passam em `node --check`
  (sintaxe JS válida).
- ✅ Servidor local (`vite preview`) responde 200 para `index.html` e para
  todos os scripts legados.
- ✅ Os módulos legados executam corretamente no carregamento da página:
  `window.showTab`, `window._appInit`, `window.hojeLocal()` e
  `window.__auth` ficam definidos como esperado.
- ⚠️ Este ambiente de execução **não tem acesso à internet externa**
  (bloqueia `cdnjs.cloudflare.com`, `jsdelivr.net`, Supabase, Google Fonts),
  então não foi possível abrir o app de ponta a ponta num navegador real
  aqui dentro. Ao rodar `npm run dev`/`npm run build` na sua máquina (com
  internet), o Chart.js, o Supabase e as fontes vão carregar normalmente,
  igual ao app original. **Recomendo testar `npm run dev` localmente e
  clicar em cada aba antes de publicar**, já que a verificação visual final
  (login, gráficos, cálculos) depende dessas conexões externas.

## Observações

- As credenciais do Supabase (URL + anon key) estão nos mesmos lugares de
  sempre, dentro de `02_supabase_module.js` e `03_auth_module.js` — não
  foram alteradas.
- `supabase_setup.sql` e `security_setup.sql` foram mantidos na raiz, iguais
  ao projeto original, caso precise recriar o banco.
