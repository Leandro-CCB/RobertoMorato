import { useRef } from 'react';

// Conteúdo original extraído de index.html (mesma estrutura e ids).
// A logica (funcoes globais definidas nos scripts legados em /public/legacy)
// continua controlando esta aba exatamente como no app original,
// pois os ids/onclick foram preservados 1:1.
const HTML = '<div id="authGate">\n  <div class="auth-card">\n    <img src="/logo.png" alt="Grupo Bertoni" onerror="this.style.display=\'none\'">\n    <h1>Grupo Bertoni — Controle PR Morato</h1>\n    <p class="auth-sub">Acesso restrito. Informe suas credenciais.</p>\n    <div id="authErrorBox" class="auth-error"></div>\n    <form id="authForm" onsubmit="return false;">\n      <div class="auth-field">\n        <label for="authUsuario">Usuário</label>\n        <input type="text" id="authUsuario" autocomplete="username" placeholder="ex: master">\n      </div>\n      <div class="auth-field">\n        <label for="authSenha">Senha</label>\n        <input type="password" id="authSenha" autocomplete="current-password" placeholder="••••••••">\n      </div>\n      <label class="auth-remember">\n        <input type="checkbox" id="authManterConectado"> Manter conectado neste dispositivo\n      </label>\n      <button type="submit" id="authBtnEntrar" class="auth-btn" onclick="window.__auth.tentarLogin()">Entrar</button>\n    </form>\n  </div>\n</div>';

export default function AuthGate() {
  const ref = useRef(null);
  return <div ref={ref} style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: HTML }} />;
}
