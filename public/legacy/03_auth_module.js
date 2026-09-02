
(function () {
  'use strict';

  const AUTH_URL = 'https://bvijihrulhxagnvqudaw.supabase.co';
  const AUTH_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2aWppaHJ1bGh4YWdudnF1ZGF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5MjYwOTgsImV4cCI6MjA5NzUwMjA5OH0.1XVsA684DU4j8sZ1Ajr7yd1i7SU0mxQeTbC5z9WQIp0';
  // Reaproveita a instância criada em 02_supabase_module.js (mesmo projeto/chave)
  // para evitar múltiplas instâncias de GoTrueClient no mesmo navegador.
  const authClient = window._sbSharedClient || window.supabase.createClient(AUTH_URL, AUTH_KEY);
  const TABLE = 'roberto_usuarios';

  const SESSION_KEY = 'bertoni_auth_session';
  const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 horas

  async function sha256Hex(texto) {
    const buf = new TextEncoder().encode(texto);
    const hashBuf = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function getStorage(manter) {
    return manter ? window.localStorage : window.sessionStorage;
  }

  function lerSessao() {
    const raw = window.sessionStorage.getItem(SESSION_KEY) || window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      const s = JSON.parse(raw);
      if (!s.ts || (Date.now() - s.ts) > SESSION_TTL_MS) return null;
      return s;
    } catch { return null; }
  }

  function salvarSessao(usuario, isMaster, manter) {
    const s = { usuario, isMaster: !!isMaster, ts: Date.now() };
    getStorage(manter).setItem(SESSION_KEY, JSON.stringify(s));
  }

  function limparSessao() {
    window.sessionStorage.removeItem(SESSION_KEY);
    window.localStorage.removeItem(SESSION_KEY);
  }

  function mostrarErro(msg) {
    const box = document.getElementById('authErrorBox');
    box.textContent = msg;
    box.classList.add('show');
  }
  function limparErro() {
    const box = document.getElementById('authErrorBox');
    box.textContent = '';
    box.classList.remove('show');
  }

  function mostrarApp(sessao) {
    document.getElementById('authGate').classList.add('hidden');
    document.getElementById('appHeader').style.display = 'flex';
    document.getElementById('main-content').style.display = '';
    const btnSb = document.getElementById('btnSidebarToggle');
    if (btnSb) btnSb.style.display = 'flex';
    document.getElementById('authUserLabel').textContent = '👋 ' + sessao.usuario + (sessao.isMaster ? ' (master)' : '');
    document.getElementById('tabBtnUsuarios').style.display = sessao.isMaster ? '' : 'none';
  }

  function mostrarLogin() {
    document.getElementById('authGate').classList.remove('hidden');
    document.getElementById('appHeader').style.display = 'none';
    document.getElementById('main-content').style.display = 'none';
    const btnSb = document.getElementById('btnSidebarToggle');
    if (btnSb) btnSb.style.display = 'none';
  }

  async function tentarLogin() {
    limparErro();
    const usuario = document.getElementById('authUsuario').value.trim();
    const senha = document.getElementById('authSenha').value;
    const manter = document.getElementById('authManterConectado').checked;
    const btn = document.getElementById('authBtnEntrar');

    if (!usuario || !senha) {
      mostrarErro('Informe usuário e senha.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Entrando...';
    try {
      const senhaHash = await sha256Hex(senha);
      const { data, error } = await authClient
        .from(TABLE)
        .select('usuario, is_master, ativo, senha_hash')
        .eq('usuario', usuario)
        .maybeSingle();

      if (error) throw error;
      if (!data || !data.ativo || data.senha_hash !== senhaHash) {
        mostrarErro('Usuário ou senha inválidos.');
        return;
      }

      salvarSessao(data.usuario, data.is_master, manter);
      mostrarApp({ usuario: data.usuario, isMaster: data.is_master });
      document.getElementById('authSenha').value = '';
    } catch (e) {
      console.error(e);
      mostrarErro('Não foi possível validar o login. Verifique sua conexão.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Entrar';
    }
  }

  function logout() {
    limparSessao();
    mostrarLogin();
  }

  // ── Gestão de usuários (aba visível apenas para o master) ──────────
  async function listarUsuariosUI() {
    const tbody = document.getElementById('usuariosTableBody');
    const msg = document.getElementById('usuariosMsg');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted,#888);padding:20px;">Carregando...</td></tr>';
    msg.textContent = '';
    const { data, error } = await authClient
      .from(TABLE)
      .select('id, usuario, is_master, ativo, created_at')
      .order('created_at', { ascending: true });

    if (error) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#c0392b;padding:20px;">Erro ao carregar usuários.</td></tr>';
      return;
    }

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted,#888);padding:20px;">Nenhum usuário cadastrado.</td></tr>';
      return;
    }

    tbody.innerHTML = data.map(u => {
      const criado = u.created_at ? new Date(u.created_at).toLocaleDateString('pt-BR') : '—';
      return `<tr>
        <td>${u.usuario}</td>
        <td>${u.is_master ? '<span class="usr-badge master">Master</span>' : '—'}</td>
        <td><span class="usr-badge ${u.ativo ? 'ativo' : 'inativo'}">${u.ativo ? 'Ativo' : 'Inativo'}</span></td>
        <td>${criado}</td>
        <td class="usr-actions">
          <button title="Redefinir senha" onclick="window.__auth.abrirModalRedefinirSenha('${u.id}','${u.usuario}')">🔑</button>
          <button title="${u.ativo ? 'Desativar' : 'Ativar'}" onclick="window.__auth.alternarAtivo('${u.id}', ${!u.ativo})">${u.ativo ? '⏸️' : '▶️'}</button>
          <button title="Excluir" onclick="window.__auth.excluirUsuario('${u.id}','${u.usuario}')">🗑️</button>
        </td>
      </tr>`;
    }).join('');
  }

  function fecharModalUsr() {
    const el = document.getElementById('usrModalOverlay');
    if (el) el.remove();
  }

  function abrirModalNovoUsuario() {
    fecharModalUsr();
    const div = document.createElement('div');
    div.id = 'usrModalOverlay';
    div.className = 'usr-modal-overlay';
    div.innerHTML = `
      <div class="usr-modal">
        <h3>+ Novo Usuário</h3>
        <div class="auth-field">
          <label>Usuário</label>
          <input type="text" id="novoUsrNome" autocomplete="off">
        </div>
        <div class="auth-field">
          <label>Senha</label>
          <input type="password" id="novoUsrSenha" autocomplete="new-password">
        </div>
        <label class="auth-remember">
          <input type="checkbox" id="novoUsrMaster"> Conceder acesso master (gerencia usuários)
        </label>
        <div style="display:flex;gap:10px;">
          <button class="auth-btn" onclick="window.__auth.criarUsuario()">Salvar</button>
          <button class="auth-btn" style="background:var(--surface3,#eee);color:var(--text,#333);" onclick="window.__auth.fecharModalUsr()">Cancelar</button>
        </div>
      </div>`;
    document.body.appendChild(div);
  }

  function abrirModalRedefinirSenha(id, usuario) {
    fecharModalUsr();
    const div = document.createElement('div');
    div.id = 'usrModalOverlay';
    div.className = 'usr-modal-overlay';
    div.innerHTML = `
      <div class="usr-modal">
        <h3>🔑 Redefinir senha — ${usuario}</h3>
        <div class="auth-field">
          <label>Nova senha</label>
          <input type="password" id="redefSenhaValor" autocomplete="new-password">
        </div>
        <div style="display:flex;gap:10px;">
          <button class="auth-btn" onclick="window.__auth.redefinirSenha('${id}')">Salvar</button>
          <button class="auth-btn" style="background:var(--surface3,#eee);color:var(--text,#333);" onclick="window.__auth.fecharModalUsr()">Cancelar</button>
        </div>
      </div>`;
    document.body.appendChild(div);
  }

  async function criarUsuario() {
    const usuario = document.getElementById('novoUsrNome').value.trim();
    const senha = document.getElementById('novoUsrSenha').value;
    const isMaster = document.getElementById('novoUsrMaster').checked;
    const msg = document.getElementById('usuariosMsg');
    if (!usuario || !senha) { alert('Preencha usuário e senha.'); return; }
    if (senha.length < 6) { alert('A senha deve ter pelo menos 6 caracteres.'); return; }

    const senha_hash = await sha256Hex(senha);
    const { error } = await authClient.from(TABLE).insert({ usuario, senha_hash, is_master: isMaster, ativo: true });
    fecharModalUsr();
    if (error) {
      msg.style.color = '#c0392b';
      msg.textContent = error.code === '23505' ? 'Já existe um usuário com esse nome.' : 'Erro ao criar usuário.';
      return;
    }
    msg.style.color = '#1f9d55';
    msg.textContent = 'Usuário criado com sucesso.';
    listarUsuariosUI();
  }

  async function redefinirSenha(id) {
    const novaSenha = document.getElementById('redefSenhaValor').value;
    if (!novaSenha || novaSenha.length < 6) { alert('A senha deve ter pelo menos 6 caracteres.'); return; }
    const senha_hash = await sha256Hex(novaSenha);
    const { error } = await authClient.from(TABLE).update({ senha_hash }).eq('id', id);
    fecharModalUsr();
    const msg = document.getElementById('usuariosMsg');
    msg.style.color = error ? '#c0392b' : '#1f9d55';
    msg.textContent = error ? 'Erro ao redefinir senha.' : 'Senha redefinida com sucesso.';
  }

  async function alternarAtivo(id, novoValor) {
    const { error } = await authClient.from(TABLE).update({ ativo: novoValor }).eq('id', id);
    const msg = document.getElementById('usuariosMsg');
    msg.style.color = error ? '#c0392b' : '#1f9d55';
    msg.textContent = error ? 'Erro ao atualizar status.' : 'Status atualizado.';
    listarUsuariosUI();
  }

  async function excluirUsuario(id, usuario) {
    if (!confirm(`Excluir o usuário "${usuario}"? Esta ação não pode ser desfeita.`)) return;
    const { error } = await authClient.from(TABLE).delete().eq('id', id);
    const msg = document.getElementById('usuariosMsg');
    msg.style.color = error ? '#c0392b' : '#1f9d55';
    msg.textContent = error ? 'Erro ao excluir usuário.' : 'Usuário excluído.';
    listarUsuariosUI();
  }

  // Permite Enter para logar.
  // OBS: o React (main.jsx) monta #authGate/#authUsuario/#authSenha de forma
  // assíncrona (script type="module"), então DOMContentLoaded pode disparar
  // antes desses elementos existirem — por isso aguardamos eles aparecerem
  // antes de chamar mostrarApp()/mostrarLogin(), evitando o erro
  // "Cannot read properties of null (reading 'classList')".
  function _aguardarAuthDOM(cb, tentativas) {
    tentativas = tentativas || 0;
    if (document.getElementById('authGate') && document.getElementById('authUsuario') && document.getElementById('authSenha')) {
      cb();
    } else if (tentativas < 200) {
      requestAnimationFrame(() => _aguardarAuthDOM(cb, tentativas + 1));
    } else {
      console.warn('[auth] elementos de autenticação não apareceram no DOM a tempo.');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    _aguardarAuthDOM(() => {
      const sessao = lerSessao();
      if (sessao) {
        mostrarApp(sessao);
      } else {
        mostrarLogin();
      }
      ['authUsuario', 'authSenha'].forEach(id => {
        document.getElementById(id).addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') tentarLogin();
        });
      });
    });
  });

  window.__auth = {
    tentarLogin, logout, listarUsuariosUI,
    abrirModalNovoUsuario, abrirModalRedefinirSenha, fecharModalUsr,
    criarUsuario, redefinirSenha, alternarAtivo, excluirUsuario
  };
})();
