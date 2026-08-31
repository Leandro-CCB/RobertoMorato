
// DATA LOCAL (sem bug de fuso UTC) — declarada aqui para ser acessível a todos os módulos
function hojeLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// toggleSidebar — mostra/oculta a sidebar (header) através de uma classe no body
function toggleSidebar() {
  document.body.classList.toggle('sidebar-collapsed');
}

// showTab — declarada aqui para estar disponível nos onclick dos botões de aba
function showTab(name, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  btn.classList.add('active');
  if (name === 'resumo') { if (typeof renderResumo === 'function') renderResumo(); }
  if (name === 'cargas') { if (typeof renderCargas === 'function') renderCargas(); }
  if (name === 'margem') { if (typeof renderMargem === 'function') renderMargem(); }
  if (name === 'fiado')  { if (typeof renderFiado  === 'function') renderFiado(); }
  if (name === 'estoque'){ if (typeof renderEstoque === 'function') renderEstoque(); }
  if (name === 'deposito'){ if (typeof renderDeposito === 'function') renderDeposito(); }
  if (name === 'config'){ if (typeof renderClientesConfig === 'function') renderClientesConfig(); }
  if (name === 'usuarios'){ if (window.__auth) window.__auth.listarUsuariosUI(); }
}
