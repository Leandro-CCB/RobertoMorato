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

## Changelog — Revisão v1.1 (correções de bugs + visual profissional)

### Bugs corrigidos

1. **"Limpar Fiado" não apagava os pagamentos de verdade** (`06_core_logic.js` +
   `02_supabase_module.js`): a função só limpava a memória e um documento
   legado de configuração; os pagamentos gravados na tabela `roberto_fiados`
   voltavam após recarregar a página. Agora a coleção é esvaziada de fato no
   Supabase via novo helper `_fbClearCollection` (exclusão intencional,
   fora da trava anti-exclusão-em-massa).
2. **Fuso horário (datas UTC)** (`06_core_logic.js`, `01_head_globals.js`):
   "Prorrogado" usava `new Date()` + `toISOString()` para sugerir a data de
   amanhã — entre 21h e meia-noite (horário de Brasília) a data saía 1 dia
   errado. Criado o helper `dataLocalAdiantada()` (componentes locais, mesmo
   padrão de `hojeLocal()`) e aplicado também em `addDiasUteis()` e
   `autoMarcarPago()`.
3. **Badge "Produto" com cor errada na tabela Resumo** (`06_core_logic.js`):
   itens de marca Produto apareciam com badge verde "Butano"; agora usam o
   badge amarelo "Produto" com o nome do produto.
4. **Crash no modal de backup** (`06_core_logic.js`): `carregarInfoBackup()`
   quebrava se `backup_meta` existisse sem o campo `ultimo`. Agora há guarda.
5. **Nomes com apóstrofo quebravam botões** (`06_core_logic.js`,
   `03_auth_module.js`): nomes de PR/cliente/usuário com aspas simples
   (ex.: `D'ALMEIDA`) quebravam os `onclick` gerados. Agora são escapados.

### Sessão persistente (login automático) — `03_auth_module.js`

- Sessão agora dura **30 dias** (antes: 12 horas) e é **renovada
  automaticamente** a cada abertura do app (sessão deslizante).
- O checkbox **"Manter conectado neste dispositivo"** vem **marcado por
  padrão** e a escolha do usuário é lembrada.
- O **último usuário** fica salvo no `localStorage` e é pré-preenchido na
  tela de login.
- Resultado: com "manter conectado" ativo (padrão), não é mais preciso
  digitar login/senha no dia a dia — só ao usar "Sair" ou trocar de
  dispositivo. A senha **não** é gravada no navegador (prática insegura);
  a sessão de 30 dias cobre o mesmo conforto.

### Visual profissional (Design System v2 — `src/styles/legacy.css`)

- Paleta refinada "Executive Amber": laranja Bertoni mais elegante com
  gradientes, azul/verde das marcas recalibrados, neutros mais limpos.
- Cards com sombras em camadas, borda suave, hover com elevação sutil e
  barra de destaque animada (summary cards / total cards).
- Sidebar com abas em pill, indicador lateral na aba ativa e micro-hover.
- Tabelas com zebra sutil, header com borda dupla e linhas com hover.
- Inputs com focus ring acessível; botões com gradiente e sombra colorida.
- Tela de login redesenhada (fundo escuro com brilhos, card animado,
  dica sobre "manter conectado") e toast escuro moderno.
- Scrollbars customizadas, `::selection` temática, animação suave na
  troca de abas e nos modais.
- `theme-color` do PWA atualizada para `#e8690b`; Service Worker na
  versão 3. Relatórios PDF e gráficos alinhados à nova cor.

