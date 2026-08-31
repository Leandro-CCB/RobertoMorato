
(function() {
  'use strict';

  const DB_NAME    = 'GasBertoniSeguranca';
  const DB_VERSION = 1;
  const STORE      = 'snapshots';
  const MAX_SNAPS  = 30; // mantém os últimos 30 snapshots locais

  let _db = null;

  // ── Abre / inicializa o banco IndexedDB ──────────────────────────
  function abrirDB() {
    return new Promise((resolve, reject) => {
      if (_db) { resolve(_db); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
          store.createIndex('ts', 'ts', { unique: false });
        }
      };
      req.onsuccess = e => { _db = e.target.result; resolve(_db); };
      req.onerror   = e => { console.warn('[LocalSeg] IndexedDB erro:', e); reject(e); };
    });
  }

  // ── Salva snapshot local ─────────────────────────────────────────
  async function salvarSnapshotLocal(origem) {
    try {
      const db = await abrirDB();
      const lancs  = (window._lancamentos || []).map(l => { const {_fbId,...r}=l; return r; });
      const cargas = (window._cargas      || []).map(c => { const {_fbId,...r}=c; return r; });
      if (!lancs.length && !cargas.length) return; // nada para salvar

      const snap = {
        ts:     Date.now(),
        origem: origem || 'auto',
        lancamentos: lancs,
        cargas:      cargas,
      };

      const tx    = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      store.add(snap);

      // Remove snapshots antigos além do limite
      tx.oncomplete = async () => {
        try {
          const db2   = await abrirDB();
          const tx2   = db2.transaction(STORE, 'readwrite');
          const st2   = tx2.objectStore(STORE);
          const todos = await new Promise(res => { const r=st2.getAll(); r.onsuccess=()=>res(r.result); });
          if (todos.length > MAX_SNAPS) {
            const remover = todos.sort((a,b)=>a.ts-b.ts).slice(0, todos.length - MAX_SNAPS);
            remover.forEach(s => st2.delete(s.id));
          }
        } catch(e) {}
      };
    } catch(e) {
      console.warn('[LocalSeg] Erro ao salvar snapshot local:', e);
    }
  }

  // ── Lista snapshots locais ───────────────────────────────────────
  async function listarSnapshotsLocais() {
    try {
      const db    = await abrirDB();
      const tx    = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      return await new Promise(res => {
        const r = store.getAll();
        r.onsuccess = () => res((r.result || []).sort((a,b) => b.ts - a.ts));
        r.onerror   = () => res([]);
      });
    } catch(e) { return []; }
  }

  // ── Restaurar snapshot local → Supabase ─────────────────────────
  window._restaurarSnapshotLocal = async function(snapId) {
    if (!confirm('Restaurar este snapshot local?\n\nOs dados serão enviados de volta para o Supabase e a página vai recarregar.')) return;
    try {
      const db    = await abrirDB();
      const tx    = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const snap  = await new Promise(res => {
        const r = store.get(snapId);
        r.onsuccess = () => res(r.result);
        r.onerror   = () => res(null);
      });
      if (!snap) { alert('Snapshot não encontrado.'); return; }

      // Envia para Supabase
      const lancs  = snap.lancamentos || [];
      const cargas = snap.cargas || [];
      await Promise.all(lancs.map(l  => window._fbSetDoc('lancamentos', String(l.id),  l)));
      await Promise.all(cargas.map(c => window._fbSetDoc('cargas',      String(c.id),  c)));

      alert(`✅ Snapshot restaurado!\n📦 ${lancs.length} lançamentos\n🚛 ${cargas.length} cargas\n\nA página será recarregada.`);
      location.reload();
    } catch(e) {
      alert('❌ Erro ao restaurar: ' + e.message);
      console.error('[LocalSeg] Erro ao restaurar snapshot:', e);
    }
  };

  // ── Exportar snapshot como JSON ──────────────────────────────────
  window._exportarSnapshotLocal = function(snapId, label) {
    abrirDB().then(db => {
      const tx    = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const r     = store.get(snapId);
      r.onsuccess = () => {
        const snap = r.result;
        if (!snap) return;
        const json = JSON.stringify(snap, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `seguranca_local_${label}.json`;
        a.click();
        URL.revokeObjectURL(url);
      };
    });
  };

  // ── Abre modal de segurança local ───────────────────────────────
  window.abrirModalSegLocal = async function() {
    let modal = document.getElementById('segLocalModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'segLocalModal';
      modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:700;align-items:center;justify-content:center;padding:16px;';
      modal.innerHTML = `
        <div style="background:#fff;border-radius:16px;padding:24px;width:100%;max-width:600px;max-height:88vh;overflow-y:auto;box-shadow:0 8px 40px rgba(0,0,0,.18);border:1px solid #dde1ec;">
          <div style="font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:1px;color:#15803d;margin-bottom:6px;display:flex;align-items:center;gap:8px;">🛡️ Segurança Local</div>
          <p style="font-size:12px;color:#6b7280;margin-bottom:6px;">Cópias salvas <strong>neste navegador</strong>, independentes do Supabase. Se o Supabase falhar, restaure daqui.</p>
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:11px;color:#15803d;">
            ✅ Salvo automaticamente a cada alteração nos lançamentos · Últimos <strong>30 snapshots</strong> mantidos
          </div>
          <div id="segLocalList" style="display:flex;flex-direction:column;gap:8px;max-height:420px;overflow-y:auto;">
            <div style="text-align:center;padding:24px;color:#9ca3af;font-size:12px;">Carregando...</div>
          </div>
          <div style="margin-top:16px;display:flex;justify-content:flex-end;">
            <button onclick="document.getElementById('segLocalModal').style.display='none'"
              style="background:#eef0f6;color:#1a1f36;border:1.5px solid #dde1ec;padding:9px 20px;border-radius:9px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;cursor:pointer;">
              ✕ Fechar
            </button>
          </div>
        </div>`;
      document.body.appendChild(modal);
      // clique fora desabilitado
    }

    modal.style.display = 'flex';

    const list = document.getElementById('segLocalList');
    list.innerHTML = '<div style="text-align:center;padding:24px;color:#9ca3af;font-size:12px;">Carregando snapshots...</div>';

    const snaps = await listarSnapshotsLocais();
    if (!snaps.length) {
      list.innerHTML = '<div style="text-align:center;padding:24px;color:#9ca3af;font-size:12px;">Nenhum snapshot local ainda.<br>Será criado automaticamente na próxima alteração.</div>';
      return;
    }

    list.innerHTML = snaps.map(s => {
      const d   = new Date(s.ts);
      const dia = d.toLocaleDateString('pt-BR');
      const hr  = d.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
      const origemIcon = s.origem === 'manual' ? '🖐️' : '🔄';
      return `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#f7f8fc;border:1px solid #dde1ec;border-radius:10px;flex-wrap:wrap;">
          <div style="font-size:18px;flex-shrink:0;">${origemIcon}</div>
          <div style="flex:1;min-width:130px;">
            <div style="font-weight:700;font-size:13px;color:#1a1f36;">${dia} <span style="font-weight:400;color:#6b7280;font-size:11px;">às ${hr}</span></div>
            <div style="font-size:11px;color:#6b7280;margin-top:2px;">
              📦 ${s.lancamentos?.length||0} lançamentos · 🚛 ${s.cargas?.length||0} cargas
              <span style="margin-left:6px;font-size:10px;background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0;border-radius:4px;padding:1px 6px;">${s.origem||'auto'}</span>
            </div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0;">
            <button onclick="window._restaurarSnapshotLocal(${s.id})" title="Restaurar para o Supabase"
              style="background:#dcfce7;color:#15803d;border:1.5px solid #bbf7d0;padding:5px 10px;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;">
              ♻️ Restaurar
            </button>
            <button onclick="window._exportarSnapshotLocal(${s.id},'${dia.replace(/\//g,'-')}_${hr.replace(/:/g,'-')}')" title="Baixar como JSON"
              style="background:#eff6ff;color:#1d4ed8;border:1.5px solid #bfdbfe;padding:5px 10px;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;">
              ⬇️ JSON
            </button>
          </div>
        </div>`;
    }).join('');
  };

  // ── Expõe função de snapshot para ser chamada ao salvar ─────────
  window._salvarSnapshotLocal = salvarSnapshotLocal;

  // Snapshot inicial ao carregar os dados do Supabase
  document.addEventListener('DOMContentLoaded', () => {
    const origInit = window._appInit;
    window._appInit = async function() {
      if (origInit) await origInit.apply(this, arguments);
      // Snapshot após carregar dados do Supabase
      setTimeout(() => salvarSnapshotLocal('carga-inicial'), 2000);
    };
  });
})();
