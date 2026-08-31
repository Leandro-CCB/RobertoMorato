import { useRef } from 'react';

// Conteúdo original extraído de index.html (mesma estrutura e ids).
// A logica (funcoes globais definidas nos scripts legados em /public/legacy)
// continua controlando esta aba exatamente como no app original,
// pois os ids/onclick foram preservados 1:1.
const HTML = '<div id="tab-usuarios" class="page">\n  <h2 style="font-family:\'Bebas Neue\',sans-serif;letter-spacing:.6px;margin-bottom:16px;">👤 Usuários do Sistema</h2>\n  <div class="usr-toolbar">\n    <button class="auth-btn" style="width:auto;padding:10px 18px;" onclick="window.__auth.abrirModalNovoUsuario()">+ Novo Usuário</button>\n  </div>\n  <div id="usuariosMsg" style="font-size:12.5px;font-weight:600;margin-bottom:10px;"></div>\n  <table class="usr-table">\n    <thead>\n      <tr><th>Usuário</th><th>Tipo</th><th>Status</th><th>Criado em</th><th>Ações</th></tr>\n    </thead>\n    <tbody id="usuariosTableBody">\n      <tr><td colspan="5" style="text-align:center;color:var(--muted,#888);padding:20px;">Carregando...</td></tr>\n    </tbody>\n  </table>\n</div>';

export default function TabUsuarios() {
  const ref = useRef(null);
  return <div ref={ref} dangerouslySetInnerHTML={{ __html: HTML }} />;
}
