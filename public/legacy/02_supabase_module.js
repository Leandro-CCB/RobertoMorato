
(function() {
  'use strict';

  const SUPABASE_URL = 'https://bvijihrulhxagnvqudaw.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2aWppaHJ1bGh4YWdudnF1ZGF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5MjYwOTgsImV4cCI6MjA5NzUwMjA5OH0.1XVsA684DU4j8sZ1Ajr7yd1i7SU0mxQeTbC5z9WQIp0';

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Mapeia as "coleções" antigas do Firestore para as tabelas do Supabase
  const TABLES = {
    lancamentos: 'roberto_lancamentos',
    cargas:      'roberto_cargas',
    config:      'roberto_config',
    backups:     'roberto_backups',
    fiados:      'roberto_fiados',      // ✅ NOVA TABELA PARA FIADOS (SEGURA)
    clientes:    'roberto_clientes',    // ✅ Cadastro de clientes (fiado por cliente)
    depositos:   'roberto_depositos',   // ✅ Descontos do Depósito Bancário
  };

  // ── Helpers de baixo nível (cada linha = { id text, data jsonb }) ────

  // GET coleção inteira (pagina em blocos de 1000, pois o PostgREST/Supabase
  // limita cada requisição a no máximo 1000 linhas por padrão)
  async function fsGetCollection(col) {
    const PAGE_SIZE = 1000;
    let all = [];
    let from = 0;
    while (true) {
      const { data, error } = await sb.from(TABLES[col]).select('id, data').range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      all = all.concat(data || []);
      if (!data || data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    return all.map(row => ({ ...(row.data || {}), _fbId: row.id }));
  }

  // GET documento único
  async function fsGetDoc(col, id) {
    const { data, error } = await sb.from(TABLES[col]).select('data').eq('id', String(id)).maybeSingle();
    if (error) throw error;
    return data ? data.data : null;
  }

  // SET (cria ou sobrescreve) documento
  async function fsSetDoc(col, id, docData) {
    const { error } = await sb.from(TABLES[col]).upsert({ id: String(id), data: docData });
    if (error) throw new Error(`fsSetDoc ${col}/${id} failed: ${error.message}`);
    return docData;
  }

  // DELETE documento
  async function fsDeleteDoc(col, id) {
    await sb.from(TABLES[col]).delete().eq('id', String(id));
  }

  // Salva coleção inteira (SEGURO: escreve primeiro, apaga órfãos depois em background)
  async function fsSaveCollection(col, arr, idFn) {
    // 1. Escreve/atualiza todos os itens PRIMEIRO (upsert em lote, uma única chamada)
    if (arr.length) {
      const rows = arr.map(item => {
        const { _fbId, ...data } = item;
        return { id: String(idFn(item)), data };
      });
      const { error } = await sb.from(TABLES[col]).upsert(rows);
      if (error) throw new Error(`fsSaveCollection ${col} failed: ${error.message}`);
    }
    // 2. Limpa órfãos em BACKGROUND (não bloqueia o retorno para o usuário)
    setTimeout(async () => {
      try {
        const existing = await fsGetCollection(col);
        const idsNovos = new Set(arr.map(item => String(idFn(item))));
        const paraRemover = existing.filter(d => !idsNovos.has(d._fbId));

        const pctRemover = existing.length > 0 ? paraRemover.length / existing.length : 0;
        const pareceExclusaoEmMassa = paraRemover.length > 5 && pctRemover > 0.2;

        if (paraRemover.length > 0 && pareceExclusaoEmMassa) {
          console.warn(`[fsSaveCollection] ⚠️ BLOQUEADO por segurança: tentativa de apagar ${paraRemover.length} de ${existing.length} documento(s) de "${col}" (${(pctRemover*100).toFixed(0)}%). Isso parece um array local desatualizado, não uma exclusão intencional. Nada foi apagado.`);
        } else if (paraRemover.length > 0) {
          await sb.from(TABLES[col]).delete().in('id', paraRemover.map(d => d._fbId));
          console.log(`[fsSaveCollection] ${paraRemover.length} órfão(s) removido(s) de "${col}"`);
        }
      } catch(e) {
        console.warn('[fsSaveCollection] Não foi possível limpar órfãos:', e);
      }
    }, 0);
  }

  // Salva apenas documentos específicos (rápido, sem varrer a coleção)
  async function fsSaveDocs(col, items, idFn) {
    if (!items.length) return;
    const rows = items.map(item => {
      const { _fbId, ...data } = item;
      return { id: String(idFn(item)), data };
    });
    const { error } = await sb.from(TABLES[col]).upsert(rows);
    if (error) throw new Error(`fsSaveDocs ${col} failed: ${error.message}`);
  }

  // Remove documentos específicos por ID
  async function fsDeleteDocs(col, ids) {
    if (!ids.length) return;
    await sb.from(TABLES[col]).delete().in('id', ids.map(String));
  }

  // ── Restaurar backup ────────────────────────────────────────────────
  window._restaurarBackup = async function(nomeBackup) {
    if (!nomeBackup) { alert('Informe o nome do backup.'); return; }
    if (!confirm(`Restaurar backup "${nomeBackup}"?\n\nIsso vai SOBRESCREVER os lançamentos e cargas atuais com os dados do backup.`)) return;
    showLoadingOverlay(true);
    try {
      const backup = await fsGetDoc('backups', nomeBackup);
      if (!backup) throw new Error('Backup não encontrado: ' + nomeBackup);

      const lancs  = backup.lancamentos || [];
      const cargas = backup.cargas || [];
      const fiados = backup.fiados || [];
      const cfg    = backup.config || {};

      if (lancs.length)  await fsSaveDocs('lancamentos', lancs, l => l.id);
      if (cargas.length) await fsSaveDocs('cargas', cargas, c => c.id);
      if (fiados.length) await fsSaveDocs('fiados', fiados, f => f.id);
      if (cfg.precos)        await fsSetDoc('config', 'precos', cfg.precos);
      if (cfg.frete)          await fsSetDoc('config', 'frete', cfg.frete);
      if (cfg.empresa_dias)   await fsSetDoc('config', 'empresa_dias', cfg.empresa_dias);
      if (cfg.prs)            await fsSetDoc('config', 'prs', cfg.prs);
      if (cfg.estoque_inicial) await fsSetDoc('config', 'estoque_inicial', cfg.estoque_inicial);

      alert(`✅ Backup "${nomeBackup}" restaurado!\n📦 ${lancs.length} lançamentos\n🚛 ${cargas.length} cargas\n💰 ${fiados.length} fiados\n\nA página será recarregada.`);
      location.reload();
    } catch(e) {
      console.error('Erro ao restaurar backup:', e);
      alert('❌ Erro ao restaurar: ' + e.message);
    } finally {
      showLoadingOverlay(false);
    }
  };

  // ── Loading overlay ─────────────────────────────────────────────────
  function showLoadingOverlay(show) {
    let el = document.getElementById('fbLoadingOverlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'fbLoadingOverlay';
      el.style.cssText = 'position:fixed;inset:0;background:rgba(255,255,255,.92);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;font-family:DM Sans,sans-serif;';
      el.innerHTML = '<div style="font-size:42px">⚡</div><div style="font-size:15px;font-weight:700;color:#e07b00">Conectando ao Supabase…</div><div style="width:44px;height:44px;border:4px solid #e07b00;border-top-color:transparent;border-radius:50%;animation:fbspin .8s linear infinite"></div><style>@keyframes fbspin{to{transform:rotate(360deg)}}</style>';
      document.body.appendChild(el);
    }
    el.style.display = show ? 'flex' : 'none';
  }

  // ── Carga inicial ───────────────────────────────────────────────────
  async function carregarDados() {
    showLoadingOverlay(true);

    if (!navigator.onLine) {
      const usouCache = (typeof window._aplicarCacheLocal === 'function') && window._aplicarCacheLocal();
      showLoadingOverlay(false);
      if (!usouCache) alert('⚠️ Sem conexão e sem dados salvos localmente ainda.\nConecte-se à internet ao menos uma vez para carregar os dados.');
      return;
    }

    try {
      const [lancs, cargas, cfgPrecos, cfgFrete, cfgDias, cfgPRs] = await Promise.all([
        fsGetCollection('lancamentos'),
        fsGetCollection('cargas'),
        fsGetDoc('config', 'precos'),
        fsGetDoc('config', 'frete'),
        fsGetDoc('config', 'empresa_dias'),
        fsGetDoc('config', 'prs'),
      ]);
      window._lancamentos       = lancs;
      window._cargas            = cargas;
      window._configPrecos      = cfgPrecos      || {};
      window._freteConfig       = cfgFrete       || {};
      window._empresaDiasConfig = cfgDias        || {};
      window._prsSupabase       = (cfgPRs && cfgPRs.lista && cfgPRs.lista.length) ? cfgPRs.lista : null;
      if (typeof window.carregarEstoqueInicialSupabase === 'function') await window.carregarEstoqueInicialSupabase();
      if (typeof window._salvarCacheLocal === 'function') window._salvarCacheLocal();
    } catch(e) {
      console.error('Erro ao carregar dados:', e);
      const usouCache = (typeof window._aplicarCacheLocal === 'function') && window._aplicarCacheLocal();
      if (!usouCache) {
        alert('⚠️ Não foi possível conectar ao Supabase.\nVerifique sua conexão com a internet.');
      } else {
        console.log('[Sync] Carregado a partir do cache local (sem internet no momento).');
      }
    }
    showLoadingOverlay(false);
  }

  // ── Backup ──────────────────────────────────────────────────────────
  async function executarBackup(label) {
    const [lancs, cargas, fiados, cfgP, cfgF, cfgD, cfgPRs, cfgEstIni] = await Promise.all([
      fsGetCollection('lancamentos'),
      fsGetCollection('cargas'),
      fsGetCollection('fiados'),
      fsGetDoc('config', 'precos'),
      fsGetDoc('config', 'frete'),
      fsGetDoc('config', 'empresa_dias'),
      fsGetDoc('config', 'prs'),
      fsGetDoc('config', 'estoque_inicial'),
    ]);
    const backup = {
      data: label,
      criadoEm: new Date().toISOString(),
      lancamentos: lancs.map(d => { const {_fbId,...r}=d; return r; }),
      cargas:      cargas.map(d => { const {_fbId,...r}=d; return r; }),
      fiados:      fiados.map(d => { const {_fbId,...r}=d; return r; }),
      config: { precos: cfgP||{}, frete: cfgF||{}, empresa_dias: cfgD||{}, prs: cfgPRs||{}, estoque_inicial: cfgEstIni||{} },
      prs: (cfgPRs && cfgPRs.lista) ? cfgPRs.lista : null,
    };
    await fsSetDoc('backups', label, backup);
    const dataPura = String(label).split('_')[0];
    await fsSetDoc('config', 'backup_meta', {
      ultimo: dataPura,
      ultimoLabel: label,
      total_lancamentos: backup.lancamentos.length,
      total_cargas: backup.cargas.length,
      total_fiados: backup.fiados.length,
    });
    return backup;
  }

  async function verificarEFazerBackup() {
    try {
      const meta  = await fsGetDoc('config', 'backup_meta');
      const hoje  = hojeLocal();
      const ultimo = meta ? meta.ultimo : '';
      const diff  = ultimo
        ? Math.floor((new Date(hoje) - new Date(ultimo)) / 86400000)
        : 999;
      if (diff >= 2) { await executarBackup(hoje); console.log('✅ Backup automático:', hoje); }
    } catch(e) { console.warn('Backup automático falhou:', e); }
  }

  // ── Exposição global (mesmos nomes de antes) ─────────────────────────
  window._fbSetDoc  = fsSetDoc;
  window._fbGetDoc  = fsGetDoc;
  window._fbGetCollection = fsGetCollection;     // ✅ ADICIONADO
  window._fbSaveCollection = fsSaveCollection;   // ✅ ADICIONADO
  window._fbDeleteDoc = fsDeleteDoc;             // ✅ ADICIONADO

  window._saveLancamentos       = () => fsSaveCollection('lancamentos', window._lancamentos || [], l => l.id);
  window._saveCargas            = () => fsSaveCollection('cargas',      window._cargas      || [], c => c.id);
  window._saveLancamentosDocs   = (items) => fsSaveDocs('lancamentos', items, l => l.id);
  window._deleteLancamentosIds  = (ids)   => fsDeleteDocs('lancamentos', ids);
  window._saveCargasDocs        = (items) => fsSaveDocs('cargas', items, c => c.id);
  window._deleteCargasIds       = (ids)   => fsDeleteDocs('cargas', ids);
  window._savePRs         = (list) => fsSetDoc('config', 'prs', { lista: list });

  window._executarBackup  = executarBackup;
  window._fbGetBackups    = async () => {
    const docs = await fsGetCollection('backups');
    return docs.sort((a,b) => (b.data||'').localeCompare(a.data||''));
  };

  // ── Boot ─────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async () => {
    await carregarDados();
    if (navigator.onLine) await verificarEFazerBackup();
    if (window._appInit) window._appInit();
  });
})();
