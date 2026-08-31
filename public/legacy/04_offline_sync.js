
(function() {
  'use strict';

  const LS_QUEUE_KEY    = 'meugasto_filaSincronizacao';
  const LS_CACHE_KEY     = 'meugasto_cacheLocal';
  const SYNC_INTERVAL_MS = 30 * 60 * 1000; // 30 em 30 minutos
  const FUNCOES_SEM_ARG  = ['_saveLancamentos', '_saveCargas']; // reenviam window._lancamentos/_cargas inteiros

  const FUNCOES_ENVOLVIDAS = [
    '_saveLancamentos', '_saveCargas',
    '_saveLancamentosDocs', '_deleteLancamentosIds',
    '_saveCargasDocs', '_deleteCargasIds',
    '_savePRs', '_fbSetDoc'
  ];

  let sincronizando = false;

  // ── Fila pendente (localStorage) ──────────────────────────────────
  function lerFila() {
    try { return JSON.parse(localStorage.getItem(LS_QUEUE_KEY) || '[]'); }
    catch(e) { return []; }
  }
  function gravarFila(fila) {
    try { localStorage.setItem(LS_QUEUE_KEY, JSON.stringify(fila)); }
    catch(e) { console.warn('[Sync] Falha ao gravar fila local:', e); }
    atualizarBadgeSync(fila.length);
  }
  function enfileirar(op) {
    const fila = lerFila();
    fila.push(op);
    gravarFila(fila);
  }
  // Remove duplicatas: para funções "sem argumento" só é preciso reenviar a última vez
  function otimizarFila(fila) {
    const ultimoIndiceSemArg = {};
    fila.forEach((op, i) => { if (FUNCOES_SEM_ARG.includes(op.fn)) ultimoIndiceSemArg[op.fn] = i; });
    return fila.filter((op, i) => !FUNCOES_SEM_ARG.includes(op.fn) || ultimoIndiceSemArg[op.fn] === i);
  }

  // ── Cache local completo dos dados (para abrir o app offline) ─────
  window._salvarCacheLocal = function() {
    try {
      const cache = {
        lancamentos:       window._lancamentos       || [],
        cargas:             window._cargas             || [],
        configPrecos:       window._configPrecos       || {},
        freteConfig:        window._freteConfig        || {},
        empresaDiasConfig:  window._empresaDiasConfig  || {},
        prsSupabase:        window._prsSupabase        || null,
        fiadoPagamentos:    window._fiadoPagamentos    || [],
        ts: Date.now()
      };
      localStorage.setItem(LS_CACHE_KEY, JSON.stringify(cache));
    } catch(e) { console.warn('[Sync] Falha ao salvar cache local:', e); }
  };
  window._aplicarCacheLocal = function() {
    try {
      const raw = localStorage.getItem(LS_CACHE_KEY);
      if (!raw) return false;
      const c = JSON.parse(raw);
      window._lancamentos       = c.lancamentos       || [];
      window._cargas            = c.cargas            || [];
      window._configPrecos      = c.configPrecos      || {};
      window._freteConfig       = c.freteConfig       || {};
      window._empresaDiasConfig = c.empresaDiasConfig || {};
      window._prsSupabase       = c.prsSupabase        || null;
      window._fiadoPagamentos   = c.fiadoPagamentos    || [];
      return true;
    } catch(e) { console.warn('[Sync] Falha ao ler cache local:', e); return false; }
  };

  // ── Envolve as funções de gravação para funcionar offline ─────────
  FUNCOES_ENVOLVIDAS.forEach(nome => {
    if (typeof window[nome] !== 'function') return;
    const original = window[nome];
    window['__orig' + nome] = original; // guarda a versão real, usada na sincronização
    window[nome] = async function(...args) {
      if (!navigator.onLine) {
        enfileirar({ fn: nome, args, ts: Date.now() });
        window._salvarCacheLocal();
        return;
      }
      try {
        const r = await original.apply(null, args);
        window._salvarCacheLocal();
        return r;
      } catch(e) {
        console.warn(`[Sync] "${nome}" falhou online, será sincronizado depois:`, e);
        enfileirar({ fn: nome, args, ts: Date.now() });
        window._salvarCacheLocal();
      }
    };
  });

  // ── Badge visual de status (offline / pendências) ─────────────────
  function atualizarBadgeSync(qtdPendenteOpcional) {
    const qtd = (typeof qtdPendenteOpcional === 'number') ? qtdPendenteOpcional : lerFila().length;
    let badge = document.getElementById('syncStatusBadge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'syncStatusBadge';
      badge.style.cssText = 'position:fixed;top:8px;right:8px;padding:5px 12px;border-radius:20px;font-family:"DM Sans",sans-serif;font-size:11px;font-weight:700;z-index:9998;letter-spacing:.3px;box-shadow:0 2px 8px rgba(0,0,0,.12);cursor:default;';
      document.body.appendChild(badge);
    }
    if (!navigator.onLine) {
      badge.style.display = 'block';
      badge.style.background = '#fef2f2';
      badge.style.color = '#dc2626';
      badge.style.border = '1.5px solid #fca5a5';
      badge.textContent = qtd > 0 ? `⚡ Offline — ${qtd} pendente(s)` : '⚡ Offline — dados em cache';
    } else if (qtd > 0) {
      badge.style.display = 'block';
      badge.style.background = '#fffbeb';
      badge.style.color = '#b45309';
      badge.style.border = '1.5px solid #fcd34d';
      badge.textContent = `🔄 Sincronizando ${qtd}...`;
    } else {
      badge.style.display = 'none';
    }
  }

  // ── Sincroniza a fila pendente com o Supabase ──────────────────────
  window._sincronizarPendencias = async function(manual) {
    if (sincronizando) return;
    if (!navigator.onLine) {
      if (manual) alert('⚠️ Sem conexão com a internet no momento.');
      return;
    }
    let fila = otimizarFila(lerFila());
    if (!fila.length) {
      atualizarBadgeSync(0);
      if (manual) console.log('[Sync] Nada pendente para sincronizar.');
      return;
    }
    sincronizando = true;
    atualizarBadgeSync(fila.length);
    const restantes = [];
    for (const op of fila) {
      try {
        const fnReal = window['__orig' + op.fn];
        if (typeof fnReal === 'function') await fnReal.apply(null, op.args);
      } catch(e) {
        console.warn('[Sync] Falha ao sincronizar operação, mantém na fila:', op.fn, e);
        restantes.push(op);
      }
    }
    gravarFila(restantes);
    sincronizando = false;
    atualizarBadgeSync(restantes.length);
    if (!restantes.length) {
      console.log('[Sync] ✅ Todas as alterações pendentes foram sincronizadas com o banco de dados.');
      window._salvarCacheLocal();
    }
  };

  // ── Gatilhos de sincronização ───────────────────────────────────────
  window.addEventListener('online', () => window._sincronizarPendencias());
  window.addEventListener('offline', () => atualizarBadgeSync());
  setInterval(() => window._sincronizarPendencias(), SYNC_INTERVAL_MS); // a cada 30 minutos

  document.addEventListener('DOMContentLoaded', () => {
    atualizarBadgeSync();
    if (navigator.onLine) window._sincronizarPendencias(); // tenta logo ao abrir, caso haja pendências de sessão anterior
  });
})();
