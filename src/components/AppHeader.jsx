import { useRef } from 'react';

// Conteúdo original extraído de index.html (mesma estrutura e ids).
// A logica (funcoes globais definidas nos scripts legados em /public/legacy)
// continua controlando esta aba exatamente como no app original,
// pois os ids/onclick foram preservados 1:1.
const HTML = '<button id="btnSidebarToggle" type="button" title="Mostrar/ocultar menu" onclick="toggleSidebar()" style="display:none;">\u2630</button>\n<header id="appHeader" style="display:none;">\n  <div class="logo">\n    <img\n      src="/logo.png"\n      alt="Grupo Bertoni — Controle Roberto"\n      width="190" height="auto"\n      onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'block\';"\n    >\n    <div class="logo-fallback">🔵 Grupo Bertoni<span>— Controle Roberto</span></div>\n  </div>\n  <div class="tabs">\n    <button class="tab-btn active" onclick="showTab(\'lancamento\',this)">📋 Lançamento</button>\n    <button class="tab-btn" onclick="showTab(\'resumo\',this)">📊 Resumo</button>\n    <button class="tab-btn" onclick="showTab(\'cargas\',this)">🚛 Cargas</button>\n    <button class="tab-btn" onclick="showTab(\'estoque\',this)">🏭 Estoque</button>\n    <button class="tab-btn" onclick="showTab(\'margem\',this)">📈 Margem</button>\n    <button class="tab-btn" onclick="showTab(\'fiado\',this)">📒 Fiado</button>\n    <button class="tab-btn" onclick="showTab(\'deposito\',this)">🏦 Depósito Bancário</button>\n    <button class="tab-btn" onclick="showTab(\'config\',this)">⚙️ Config</button>\n    <button class="tab-btn" id="tabBtnUsuarios" style="display:none;" onclick="showTab(\'usuarios\',this)">👤 Usuários</button>\n  </div>\n  <span id="authUserLabel" style="margin-left:10px;font-size:12px;font-weight:700;color:var(--muted,#888);"></span>\n  <button id="btnAtualizarPrograma" type="button" title="Recarrega o app ignorando o cache (igual Ctrl+Shift+R)" onclick="atualizarPrograma()">🔄 Atualizar Programa</button>\n  <button id="btnLogout" onclick="window.__auth.logout()">🚪 Sair</button>\n</header>';

export default function AppHeader() {
  const ref = useRef(null);
  return <div ref={ref} style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: HTML }} />;
}
