const PRS = [
  'ABIDIAS','ADEMIR','ADRIANO','ALMEIDA','AVULSO','BOM GAS','BUIU','C. FINAL',
  'CABERÃO','CLAYTON','COSTELA','ECONOMIA','EMANUEL','EVERTON','FABIANO',
  'GABRIEL','GEL','GERALDO','HENRIQUE','IDEAL','IVAN','JAL','LEANDRO',
  'LORIVAL','LUCAS','LUCIANA','LUIS','MATEUS','MAURICIO','MORATO','NALVA',
  'NETO','NOVA','OLIVERA','PORTARIA ARCILIO','PORTARIA ROSA','ROBERTO',
  'SANTOS','SENEVAIDO','SEU PEDRO','SIQUERA'
].sort();

// ── CLIENTES (cadastro para atribuição de Fiado) ──
let CLIENTES = [];

const PAY_FIELDS = ['Espécie','Débito','Crédito','QR Code','Pix','Moeda','Fiado','Gás do Povo','Sobras Anteriores'];
const PAY_IDS    = ['pEspecie','pDebito','pCredito','pQrCode','pPix','pMoeda','pFiado','pGasPovo','pSobrasAnt'];
const PAY_EMOJIS = {'Espécie':'💵','Débito':'💳','Crédito':'💳','QR Code':'📱','Pix':'⚡','Moeda':'🪙','Fiado':'📒','Gás do Povo':'🔥','Sobras Anteriores':'🏦'};

// Variáveis de estado — preenchidas pelo módulo Supabase antes de _appInit
let lancamentos  = [];
let configPrecos = {};

// ── INIT (chamado após Supabase carregar os dados) ──
window._appInit = async function() {
  // Sincroniza variáveis locais com os dados carregados do Supabase
  lancamentos  = window._lancamentos  || [];
  configPrecos = window._configPrecos || {};
  cargas       = window._cargas       || [];
  freteConfig  = window._freteConfig  || {};
  empresaDiasConfig = window._empresaDiasConfig || {};

  // ── Remove duplicatas por id (dados corrompidos no Supabase) ──
  const _vistoIds = new Set();
  const _antes = lancamentos.length;
  lancamentos = lancamentos.filter(l => {
    if (_vistoIds.has(l.id)) return false;
    _vistoIds.add(l.id);
    return true;
  });
  if (lancamentos.length < _antes) {
    console.warn(`[dedup] Removidas ${_antes - lancamentos.length} entradas duplicadas por id. Salvando...`);
    window._lancamentos = lancamentos;
    window._saveLancamentos().then(() => console.log('[dedup] Supabase limpo!'));
  }
  // Carrega lista de PRs do Supabase (se existir), sobrepondo o array hardcoded
  if (window._prsSupabase) {
    PRS.length = 0;
    window._prsSupabase.forEach(p => PRS.push(p));
  }
  document.getElementById('fData').value = hojeLocal();
  ['fPr','rFiltPr','editPr'].forEach(id => {
    const sel = document.getElementById(id);
    if(id==='fPr') { const ph=document.createElement('option');ph.value='';ph.textContent='— Selecione o PR —';sel.appendChild(ph); }
    else if(id==='rFiltPr') { const ph=document.createElement('option');ph.value='';ph.textContent='Todos os PRs';sel.appendChild(ph); }
    PRS.forEach(pr => { const o=document.createElement('option'); o.value=pr; o.textContent=pr; sel.appendChild(o); });
  });
  // Carrega clientes cadastrados (para atribuição de Fiado)
  // OBS: isto roda ANTES das demais inicializações de propósito — se alguma
  // etapa abaixo lançar um erro, a lista de clientes já estará carregada.
  try {
    const cfgClientes = await window._fbGetDoc('config', 'clientes');
    CLIENTES = (cfgClientes && cfgClientes.lista) ? cfgClientes.lista : [];
  } catch(e) { console.warn('[clientes] erro ao carregar:', e.message); CLIENTES = []; }
  popularSelectFiadoCliente();
  if (typeof renderClientesConfig === 'function') renderClientesConfig();

  buildLinhas();
  buildConfigGrid();

  renderTable();
  renderTotals();
  initCargasUI();
}; // end _appInit

// ── CLIENTES ──────────────────────────────────────────────────
// (mantido por compatibilidade — não é mais usado pelo box de fiado,
// que agora suporta distribuição entre vários clientes, mas outras
// telas como abrirEdicaoGrupoComDados ainda usam um <select> simples)
function popularSelectFiadoCliente() {
  const sel = document.getElementById('fFiadoCliente');
  if (!sel) return;
  const atual = sel.value;
  sel.innerHTML = '<option value="">— Não, manter no nome do PR —</option>' +
    CLIENTES.map(c => `<option value="${c}">${c}</option>`).join('');
  sel.value = CLIENTES.includes(atual) ? atual : '';
}

// ── DISTRIBUIÇÃO DE FIADO ENTRE CLIENTES ────────────────────────
// _fiadoDist: [{ cliente:'NOME'|'', valor: number }]. Entradas sem cliente
// selecionado ou com valor <= 0 não contam como distribuídas; o restante
// (total do fiado - distribuído) permanece automaticamente no nome do PR.
let _fiadoDist = [];

function toggleFiadoClienteBox() {
  const box = document.getElementById('fiadoClienteBox');
  const val = parseFloat(document.getElementById('pFiado')?.value) || 0;
  if (!box) return;
  const totalEl = document.getElementById('fiadoDistTotalVal');
  if (totalEl) totalEl.textContent = fmtVal(val);
  if (val > 0.009) {
    if (!_fiadoDist.length) _fiadoDist.push({ cliente: '', valor: 0 });
    renderFiadoDistLinhas();
    box.style.display = 'block';
  } else {
    box.style.display = 'none';
    _fiadoDist = [];
    renderFiadoDistLinhas();
  }
}

function renderFiadoDistLinhas() {
  const cont = document.getElementById('fiadoDistLinhas');
  if (!cont) return;
  cont.innerHTML = _fiadoDist.map((row, i) => `
    <div style="display:flex;gap:8px;margin-bottom:6px;align-items:center;">
      <select onchange="atualizarFiadoDistCliente(${i},this.value)" style="flex:2;padding:7px 10px;border-radius:8px;border:1.5px solid var(--border);font-family:'DM Sans',sans-serif;font-size:12px;font-weight:600;color:var(--text);background:#fff;">
        <option value="">— Manter no nome do PR —</option>
        ${CLIENTES.map(c => `<option value="${c}" ${row.cliente === c ? 'selected' : ''}>${c}</option>`).join('')}
      </select>
      <input type="number" min="0" step="0.01" placeholder="0,00" value="${row.valor > 0 ? row.valor : ''}" oninput="atualizarFiadoDistValor(${i},this.value)" style="flex:1;max-width:130px;padding:7px 10px;border-radius:8px;border:1.5px solid var(--border);font-family:'DM Sans',sans-serif;font-size:12px;" />
      <button type="button" onclick="removerFiadoDistLinha(${i})" title="Remover" style="background:transparent;border:none;color:var(--danger);font-weight:700;cursor:pointer;font-size:15px;line-height:1;padding:4px 6px;">✕</button>
    </div>`).join('');
  atualizarResumoFiadoDist();
}

function adicionarFiadoDistLinha() {
  _fiadoDist.push({ cliente: '', valor: 0 });
  renderFiadoDistLinhas();
}

function removerFiadoDistLinha(i) {
  _fiadoDist.splice(i, 1);
  renderFiadoDistLinhas();
}

function atualizarFiadoDistCliente(i, val) {
  if (_fiadoDist[i]) _fiadoDist[i].cliente = val;
  atualizarResumoFiadoDist();
}

function atualizarFiadoDistValor(i, val) {
  if (_fiadoDist[i]) _fiadoDist[i].valor = parseFloat(val) || 0;
  atualizarResumoFiadoDist();
}

function getFiadoDistValidas() {
  return _fiadoDist.filter(r => r.cliente && r.valor > 0.009);
}

function atualizarResumoFiadoDist() {
  const total = parseFloat(document.getElementById('pFiado')?.value) || 0;
  const distribuido = getFiadoDistValidas().reduce((s, r) => s + r.valor, 0);
  const restante = total - distribuido;
  const elD = document.getElementById('fiadoDistDistribuidoVal');
  const elR = document.getElementById('fiadoDistRestanteVal');
  if (elD) elD.textContent = fmtVal(distribuido);
  if (elR) {
    elR.textContent = fmtVal(restante);
    elR.style.color = restante < -0.009 ? 'var(--danger)' : '';
  }
}

async function _salvarClientes() {
  await window._fbSetDoc('config', 'clientes', { lista: CLIENTES });
}

function renderClientesConfig() {
  const div = document.getElementById('clientesListDiv');
  if (!div) return;
  if (!CLIENTES.length) {
    div.innerHTML = '<div style="font-size:12px;color:var(--muted2);">Nenhum cliente cadastrado ainda.</div>';
    return;
  }
  div.innerHTML = CLIENTES.map(c => `
    <span style="display:inline-flex;align-items:center;gap:6px;background:var(--surface2);border:1.5px solid var(--border);border-radius:8px;padding:6px 10px;font-size:12px;font-weight:700;color:var(--text);">
      👤 ${c}
      <button onclick="removerCliente('${c.replace(/'/g,"\\'")}')" title="Remover cliente" style="background:transparent;border:none;color:var(--danger);cursor:pointer;font-weight:700;font-size:13px;">✕</button>
    </span>`).join('');
}

async function adicionarNovoCliente() {
  const input = document.getElementById('newClienteInput');
  const msg = document.getElementById('newClienteMsg');
  const nome = (input.value || '').trim().toUpperCase();
  if (!nome) { msg.style.color = 'var(--danger)'; msg.textContent = '⚠ Informe um nome.'; return; }
  if (CLIENTES.includes(nome)) { msg.style.color = 'var(--danger)'; msg.textContent = '⚠ Cliente já cadastrado.'; return; }
  CLIENTES.push(nome);
  CLIENTES.sort();
  await _salvarClientes();
  input.value = '';
  msg.style.color = 'var(--success)';
  msg.textContent = `✓ Cliente "${nome}" adicionado!`;
  setTimeout(() => { msg.textContent = ''; }, 3000);
  renderClientesConfig();
  popularSelectFiadoCliente();
}

async function removerCliente(nome) {
  if (!confirm(`Remover o cliente "${nome}"?\n\nIsso NÃO apaga fiados já atribuídos a ele — apenas remove da lista de cadastro.`)) return;
  CLIENTES = CLIENTES.filter(c => c !== nome);
  await _salvarClientes();
  renderClientesConfig();
  popularSelectFiadoCliente();
}

// ── LINHAS ──
var _numLinhas = 3;

const PRODUTOS_AVULSOS = [
  { label: 'Água 20L',  cat: 'agua' },
  { label: 'Água 10L',  cat: 'agua' },
  { label: 'Galão',     cat: 'agua' },
  { label: 'P5',        cat: 'botijao' },
  { label: 'P20',       cat: 'botijao' },
  { label: 'P45',       cat: 'botijao' },
  { label: 'Cota P13',  cat: 'cota' },
  { label: 'Cota P5',   cat: 'cota' },
  { label: 'Cota P20',  cat: 'cota' },
  { label: 'Cota P45',  cat: 'cota' },
  { label: 'Registro',  cat: 'acessorio' },
  { label: 'Kit',       cat: 'acessorio' },
  { label: 'Bomba de Água', cat: 'acessorio' },
];
function _criarLinhaEl(i) {
  const chipsHtml = PRODUTOS_AVULSOS.map(p =>
    `<button class="prod-chip" data-prod="${p.label}" onclick="selecionarProduto(${i},this,'${p.label}')">${p.label}</button>`
  ).join('');
  const d = document.createElement('div');
  d.className='linha-row'; d.id='linha_'+i;
  d.innerHTML=`
    <input type="number" id="l${i}_qtd" min="0" placeholder="0" oninput="calcLinha(${i})" />
    <input type="number" id="l${i}_preco" min="0" step="0.01" placeholder="0,00" oninput="calcLinha(${i})" />
    <input type="text" id="l${i}_total" readonly placeholder="R$ 0,00" />
    <div class="brand-toggle">
      <button class="brand-btn ultra" id="l${i}_ultra" onclick="selectLinhaBrand(${i},'Ultragaz')">🔵 Ultra</button>
      <button class="brand-btn butano" id="l${i}_butano" onclick="selectLinhaBrand(${i},'Butano')">🟢 Butano</button>
      <button class="brand-btn produto" id="l${i}_produto" onclick="selectLinhaBrand(${i},'Produto')">📦 Produto</button>
    </div>
    <div class="prod-chips-row" id="l${i}_chips" style="display:none;">
      ${chipsHtml}
    </div>`;
  return d;
}

function selecionarProduto(i, el, prod) {
  document.querySelectorAll(`#l${i}_chips .prod-chip`).forEach(c => c.classList.remove('ativo'));
  el.classList.add('ativo');
  document.getElementById('linha_'+i).dataset.produtoSelecionado = prod;
}

function buildLinhas() {
  const c = document.getElementById('linhas-container');
  c.innerHTML = '';
  _numLinhas = 3;
  for (let i=0;i<_numLinhas;i++) c.appendChild(_criarLinhaEl(i));
}

function adicionarLinha() {
  const c = document.getElementById('linhas-container');
  c.appendChild(_criarLinhaEl(_numLinhas));
  _numLinhas++;
  setTimeout(()=>{ const el=document.getElementById(`l${_numLinhas-1}_qtd`); if(el) el.focus(); },50);
}

function removerUltimaLinha() {
  if(_numLinhas<=1){ showToast('⚠ Mínimo de 1 linha!'); return; }
  _numLinhas--;
  const el=document.getElementById('linha_'+_numLinhas);
  if(el) el.remove();
  calcLinhaTotais();
}

function selectLinhaBrand(i,brand) {
  document.getElementById(`l${i}_ultra`).classList.toggle('active',brand==='Ultragaz');
  document.getElementById(`l${i}_butano`).classList.toggle('active',brand==='Butano');
  document.getElementById(`l${i}_produto`).classList.toggle('active',brand==='Produto');
  const chipsRow = document.getElementById(`l${i}_chips`);
  if (chipsRow) chipsRow.style.display = brand==='Produto' ? 'flex' : 'none';
  if (brand !== 'Produto') {
    const linhaEl = document.getElementById('linha_'+i);
    if (linhaEl) delete linhaEl.dataset.produtoSelecionado;
  }
  const pr=document.getElementById('fPr').value;
  if (pr&&configPrecos[pr]) {
    const p=brand==='Ultragaz'?(configPrecos[pr].ultragaz||0):(configPrecos[pr].butano||0);
    if(p>0) document.getElementById(`l${i}_preco`).value=p;
  }
  calcLinha(i);
}

async function onPrChange() {
  for(let i=0;i<_numLinhas;i++){
    if(document.getElementById(`l${i}_ultra`).classList.contains('active')) selectLinhaBrand(i,'Ultragaz');
    if(document.getElementById(`l${i}_butano`).classList.contains('active')) selectLinhaBrand(i,'Butano');
  }
  const pr = document.getElementById('fPr').value;
  const infoEl = document.getElementById('prSobraInfo');
  if (pr && infoEl) {
    const fiadoPorPR = await calcFiadoPorPR();
    const saldoFiado = (fiadoPorPR[pr] && fiadoPorPR[pr].saldo) || 0; 
    const sobra = -saldoFiado;
    if (sobra > 0.009) {
      infoEl.style.display = 'flex';
      infoEl.style.background = '#dcfce7';
      infoEl.style.border = '1.5px solid #bbf7d0';
      infoEl.style.color = '#15803d';
      infoEl.innerHTML = `💰 <span>Crédito/sobra disponível: <strong>R$ ${fmtNum(sobra)}</strong></span>`;
    } else if (sobra < -0.009) {
      infoEl.style.display = 'flex';
      infoEl.style.background = '#fef2f2';
      infoEl.style.border = '1.5px solid #fca5a5';
      infoEl.style.color = '#dc2626';
      infoEl.innerHTML = `⚠️ <span>Fiado em aberto: <strong>R$ ${fmtNum(Math.abs(sobra))}</strong></span>`;
    } else {
      infoEl.style.display = 'none';
    }
  } else if (infoEl) {
    infoEl.style.display = 'none';
  }
}

function calcLinha(i) {
  const qtd=parseFloat(document.getElementById(`l${i}_qtd`).value)||0;
  const p  =parseFloat(document.getElementById(`l${i}_preco`).value)||0;
  const t  =qtd*p;
  document.getElementById(`l${i}_total`).value=t>0?'R$ '+fmtNum(t):'';
  calcLinhaTotais();
}

function getLinhaBrand(i){
  if(document.getElementById(`l${i}_ultra`).classList.contains('active')) return 'Ultragaz';
  if(document.getElementById(`l${i}_butano`).classList.contains('active')) return 'Butano';
  if(document.getElementById(`l${i}_produto`).classList.contains('active')) return 'Produto';
  return '';
}

function getLinhaProduto(i){
  const linhaEl = document.getElementById('linha_'+i);
  return (linhaEl && linhaEl.dataset.produtoSelecionado) || '';
}

function calcLinhaTotais(){
  let q=0,v=0,n=0;
  for(let i=0;i<_numLinhas;i++){
    const qq=parseFloat(document.getElementById(`l${i}_qtd`).value)||0;
    const pp=parseFloat(document.getElementById(`l${i}_preco`).value)||0;
    const marca=getLinhaBrand(i);
    if(qq>0){
      if(marca!=='Produto') q+=qq; 
      v+=qq*pp;
      n++;
    }
  }
  document.getElementById('lTotalQtd').textContent=q;
  document.getElementById('lTotalVal').textContent='R$ '+fmtNum(v);
  document.getElementById('lTotalLinhas').textContent=n;
  calcPagTotal();
}

// ── PAGAMENTO ──
function calcPagTotal(){
  let t=0; PAY_IDS.forEach(id=>t+=parseFloat(document.getElementById(id).value)||0);
  document.getElementById('pagTotal').textContent='R$ '+fmtNum(t);
  const totalVendaEl=document.getElementById('lTotalVal');
  const totalVenda=totalVendaEl?parseFloat(totalVendaEl.textContent.replace(/[^\d,]/g,'').replace(',','.'))||0:0;
  const sobraEl=document.getElementById('pagSobra');
  const painel=document.getElementById('painelSobraFalta');
  const painelMsg=document.getElementById('painelSobraFaltaMsg');
  if(sobraEl && t>0 && totalVenda>0){
    const diff=Math.round((t-totalVenda)*100)/100;
    if(diff>0){
      sobraEl.style.display='';
      sobraEl.style.background='#dcfce7';
      sobraEl.style.color='#15803d';
      sobraEl.textContent='💰 Sobra: R$ '+fmtNum(diff);
      if(painel && painelMsg){
        painel.style.display='';
        painel.style.borderColor='#6EE7B7';
        painel.style.background='#F0FDF4';
        painelMsg.style.color='#065F46';
        painelMsg.textContent=`💰 Sobrou R$ ${fmtNum(diff)}. Registrar esta sobra no fiado de ${document.getElementById('fPr').value||'PR'} como crédito?`;
        painel.dataset.tipo='sobra';
        painel.dataset.valor=diff;
      }
    } else if(diff<0){
      sobraEl.style.display='';
      sobraEl.style.background='#fef2f2';
      sobraEl.style.color='#dc2626';
      sobraEl.textContent='⚠ Falta: R$ '+fmtNum(Math.abs(diff));
      if(painel && painelMsg){
        painel.style.display='';
        painel.style.borderColor='#FCA5A5';
        painel.style.background='#FEF2F2';
        painelMsg.style.color='#991B1B';
        painelMsg.textContent=`⚠️ Faltou R$ ${fmtNum(Math.abs(diff))}. Registrar esta falta como fiado de ${document.getElementById('fPr').value||'PR'}?`;
        painel.dataset.tipo='falta';
        painel.dataset.valor=Math.abs(diff);
      }
    } else {
      sobraEl.style.display='none';
      if(painel) painel.style.display='none';
    }
  } else {
    if(sobraEl) sobraEl.style.display='none';
    if(painel) painel.style.display='none';
  }
}

// Estado temporário do painel: guardado após registrar a venda principal
let _pendenteSobraFalta = null;

function confirmarSobraFalta() {
  if (!_pendenteSobraFalta) return;
  _registrarSobraFaltaNoFiado(_pendenteSobraFalta);
  _pendenteSobraFalta = null;
  document.getElementById('painelSobraFalta').style.display = 'none';
}

function ignorarSobraFalta() {
  _pendenteSobraFalta = null;
  document.getElementById('painelSobraFalta').style.display = 'none';
}

async function _registrarSobraFaltaNoFiado({ tipo, valor, pr, data }) {
  const pags = await _loadFiadoPag();
  const id = Date.now();
  if (tipo === 'sobra') {
    pags.push({ id, pr, data, valor, obs: `💰 Sobra de troco registrada automaticamente`, formasPag: null, tipo: 'sobra' });
  } else {
    pags.push({ id, pr, data, valor, obs: `⚠️ Falta de pagamento registrada como fiado`, formasPag: null, tipo: 'falta_fiado' });
  }
  window._fiadoPagamentos = pags;
  await _saveFiadoPag();
  showToast(tipo === 'sobra' ? '💰 Sobra registrada no fiado!' : '📒 Falta registrada como fiado!');
  if (typeof renderFiado === 'function' && document.getElementById('tab-fiado')?.classList.contains('active')) renderFiado();
}

// ── MODO EDIÇÃO NO FORMULÁRIO ──
let _editFormData=null, _editFormPr=null;

function carregarEdicaoNoForm(data, pr){
 try {
  const itens=lancamentos.filter(l=>l.data===data&&l.pr===pr);
  if(!itens.length) return;

  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('tab-lancamento').classList.add('active');
  document.querySelector('.tab-btn').classList.add('active');

  document.getElementById('grupoLancModal').style.display='none';

  document.getElementById('fData').value=data;
  document.getElementById('fPr').value=pr;

  const vistoIds2=new Set();
  const itensDedupe=itens.filter(l=>{ if(vistoIds2.has(l.id)) return false; vistoIds2.add(l.id); return true; });
  const cont=document.getElementById('linhas-container');
  cont.innerHTML='';
  _numLinhas=0;
  itensDedupe.forEach((l,i)=>{
    const el=_criarLinhaEl(i);
    cont.appendChild(el);
    _numLinhas++;
    document.getElementById(`l${i}_qtd`).value=l.qtd;
    document.getElementById(`l${i}_preco`).value=l.preco;
    document.getElementById(`l${i}_ultra`).classList.toggle('active',l.marca==='Ultragaz');
    document.getElementById(`l${i}_butano`).classList.toggle('active',l.marca==='Butano');
    document.getElementById(`l${i}_produto`).classList.toggle('active',l.marca==='Produto');
    const chipsRow = document.getElementById(`l${i}_chips`);
    if (chipsRow) {
      chipsRow.style.display = l.marca==='Produto' ? 'flex' : 'none';
      if (l.marca==='Produto' && l.produto) {
        chipsRow.querySelectorAll('.prod-chip').forEach(c => {
          c.classList.toggle('ativo', c.dataset.prod === l.produto);
        });
        el.dataset.produtoSelecionado = l.produto;
      }
    }
    calcLinha(i);
  });

  let pagRef={}, valeGasRef=0, valeGasFuncionarioRef=0, fiadoDistRef=null, fiadoClienteRef='';
  for(const l of itens){
    const p=l.pag||{};
    const temValor=PAY_FIELDS.some(f=>p[f]>0);
    if(temValor){
      pagRef=p; valeGasRef=l.valeGas||0; valeGasFuncionarioRef=l.valeGasFuncionario||0;
      fiadoDistRef=l.fiadoDistribuicao||null; fiadoClienteRef=l.fiadoCliente||'';
      break;
    }
  }
  PAY_IDS.forEach((id,idx)=>{
    const val=pagRef[PAY_FIELDS[idx]];
    document.getElementById(id).value=(val&&val>0)?val:'';
  });
  document.getElementById('pValeGas').value = valeGasRef>0 ? valeGasRef : '';
  const elVgf=document.getElementById('pValeGasFuncionario');
  if (elVgf) elVgf.value = valeGasFuncionarioRef>0 ? valeGasFuncionarioRef : '';

  // Restaura a distribuição de fiado (nova estrutura), ou converte o
  // campo antigo (fiadoCliente único) para uma linha de distribuição.
  if (fiadoDistRef && fiadoDistRef.length) {
    _fiadoDist = fiadoDistRef.map(r=>({cliente:r.cliente||'', valor:r.valor||0}));
  } else if (fiadoClienteRef) {
    _fiadoDist = [{cliente: fiadoClienteRef, valor: pagRef['Fiado']||0}];
  } else {
    _fiadoDist = [];
  }
  toggleFiadoClienteBox();
  calcPagTotal();

  _editFormData=data; _editFormPr=pr;
  document.getElementById('btnRegistrar').textContent='💾 Salvar Alterações';
  document.getElementById('btnCancelarEdicao').style.display='';
  document.getElementById('formEditLabel').style.display='';
  document.getElementById('formError').textContent='';

  document.getElementById('tab-lancamento').scrollIntoView({behavior:'smooth'});
  document.querySelector('.card').scrollIntoView({behavior:'smooth'});
 } catch(e) {
  console.error('[carregarEdicaoNoForm] erro:', e);
  showToast('⚠ Erro ao abrir edição: ' + e.message);
 }
}

function cancelarEdicaoForm(){
  _editFormData=null; _editFormPr=null;
  _pendenteSobraFalta=null;
  document.getElementById('btnRegistrar').textContent='✚ Registrar Venda';
  document.getElementById('btnCancelarEdicao').style.display='none';
  document.getElementById('formEditLabel').style.display='none';
  const painelEl=document.getElementById('painelSobraFalta');
  if(painelEl) painelEl.style.display='none';
  buildLinhas();
  PAY_IDS.forEach(id=>document.getElementById(id).value='');
  calcPagTotal();
  document.getElementById('fPr').value='';
  document.getElementById('pValeGas').value='';
  const elVgf=document.getElementById('pValeGasFuncionario');
  if (elVgf) elVgf.value='';
  _fiadoDist = [];
  renderFiadoDistLinhas();
  document.getElementById('fiadoClienteBox').style.display='none';
  document.getElementById('formError').textContent='';
}
// ── REGISTRAR / SALVAR ──
async function addLancamento(){
  const data=document.getElementById('fData').value;
  const pr  =document.getElementById('fPr').value;
  const err =document.getElementById('formError');
  if(!data){err.textContent='⚠ Informe a data.';return;}
  if(!pr)  {err.textContent='⚠ Selecione o PR.';return;}
  err.textContent='';
  const linhas=[];
  for(let i=0;i<_numLinhas;i++){
    const q=parseFloat(document.getElementById(`l${i}_qtd`).value)||0;
    const p=parseFloat(document.getElementById(`l${i}_preco`).value)||0;
    const m=getLinhaBrand(i);
    const prod=getLinhaProduto(i);
    if(m==='Produto' && q>0 && !prod){err.textContent=`⚠ Selecione o produto na linha ${i+1}.`;return;}
    if(q>0&&m) linhas.push({qtd:q,preco:p,total:q*p,marca:m,produto:prod||''});
  }
  if(!linhas.length){err.textContent='⚠ Preencha ao menos 1 linha (qtd + preço + marca).';return;}
  const pag={};
  PAY_IDS.forEach((id,idx)=>pag[PAY_FIELDS[idx]]=parseFloat(document.getElementById(id).value)||0);
  const valeGas = parseInt(document.getElementById('pValeGas')?.value, 10) || 0;
  const valeGasFuncionario = parseInt(document.getElementById('pValeGasFuncionario')?.value, 10) || 0;

  // Distribuição de Fiado entre clientes cadastrados (o que sobra fica com o PR)
  const fiadoDistribuicao = (pag['Fiado'] > 0.009) ? getFiadoDistValidas() : [];
  if (fiadoDistribuicao.length) {
    const totalDistribuido = fiadoDistribuicao.reduce((s,r)=>s+r.valor,0);
    if (totalDistribuido > pag['Fiado'] + 0.009) {
      err.textContent = `⚠ O total distribuído entre clientes (R$ ${fmtNum(totalDistribuido)}) não pode ultrapassar o valor do Fiado (R$ ${fmtNum(pag['Fiado'])}).`;
      return;
    }
  }

  const sobrasAntUsadas = pag['Sobras Anteriores'] || 0;
  if (sobrasAntUsadas > 0.009) {
    let excludeVid = null;
    if (_editFormData !== null) {
      const oldItensSobra = lancamentos.filter(l => l.data === _editFormData && l.pr === _editFormPr);
      if (oldItensSobra.length) excludeVid = oldItensSobra[0].vendaId != null ? oldItensSobra[0].vendaId : oldItensSobra[0].id;
    }
    const sobraDisponivel = await getSobraDisponivelPR(pr, excludeVid);
    if (sobrasAntUsadas > sobraDisponivel + 0.009) {
      err.textContent = sobraDisponivel > 0
        ? `⚠ Não há sobra suficiente para ${pr}. Disponível: R$ ${fmtNum(sobraDisponivel)}.`
        : `⚠ Não há sobra registrada para ${pr}.`;
      return;
    }
  }

  if(_editFormData!==null){
    const oldItens=lancamentos.filter(l=>l.data===_editFormData&&l.pr===_editFormPr);
    const comVendaId=oldItens.filter(l=>l.vendaId!=null);
    const vendaIdBase=comVendaId.length?Math.min(...comVendaId.map(l=>Number(l.vendaId))):(oldItens.length?oldItens[0].id:Date.now());
    lancamentos=lancamentos.filter(l=>!(l.data===_editFormData&&l.pr===_editFormPr));
    const now=Date.now();
    const novosItens=[];
    linhas.forEach((l,idx)=>{
      const id=oldItens[idx]?oldItens[idx].id:(now+idx);
      const item={id,vendaId:vendaIdBase,data,pr,...l,
        pag:idx===0?pag:Object.fromEntries(PAY_FIELDS.map(f=>[f,0])),
        valeGas: idx===0 ? valeGas : 0,
        valeGasFuncionario: idx===0 ? valeGasFuncionario : 0,
        fiadoDistribuicao: idx===0 ? fiadoDistribuicao : [],
        fiadoCliente: ''};
      lancamentos.push(item);
      novosItens.push(item);
    });
    const idsOrfaos=oldItens.slice(linhas.length).map(l=>l.id);
    await save({type:'add', items:novosItens});
    if (idsOrfaos.length) await window._deleteLancamentosIds(idsOrfaos);
    renderTable(); renderTotals();
    showToast('✓ Venda atualizada!');
    cancelarEdicaoForm();
  } else {
    const jaExiste=lancamentos.filter(l=>l.data===data&&l.pr===pr);
    if(jaExiste.length>0){
      const existLinhas=jaExiste.map(l=>l.qtd+'|'+l.preco+'|'+l.marca).sort().join(';');
      const novasLinhasKey=linhas.map(l=>l.qtd+'|'+l.preco+'|'+l.marca).sort().join(';');
      if(existLinhas===novasLinhasKey){
        if(!confirm(`⚠️ Já existe um lançamento para ${pr} em ${fmtDate(data)} com exatamente as mesmas linhas e valores.\n\nDeseja registrar mesmo assim?`)) return;
      } else {
        if(!confirm(`ℹ️ ${pr} já possui lançamento em ${fmtDate(data)}.\n\nDeseja adicionar mais uma venda neste mesmo dia?`)) return;
      }
    }
    const now=Date.now();
    const vendaId=now;
    const novasLinhas=[];
    linhas.forEach((l,idx)=>{
      const novoLanc={id:now+idx, vendaId, data, pr, ...l,
        pag: idx===0 ? pag : Object.fromEntries(PAY_FIELDS.map(f=>[f,0])),
        valeGas: idx===0 ? valeGas : 0,
        valeGasFuncionario: idx===0 ? valeGasFuncionario : 0,
        fiadoDistribuicao: idx===0 ? fiadoDistribuicao : [],
        fiadoCliente: ''};
      lancamentos.push(novoLanc);
      novasLinhas.push(novoLanc);
    });
    await save({type:'add', items:novasLinhas}); renderTable(); renderTotals();

    const painelEl = document.getElementById('painelSobraFalta');
    if (painelEl && painelEl.style.display !== 'none' && painelEl.dataset.tipo && painelEl.dataset.valor) {
      _pendenteSobraFalta = {
        tipo: painelEl.dataset.tipo,
        valor: parseFloat(painelEl.dataset.valor),
        pr,
        data
      };
    } else {
      _pendenteSobraFalta = null;
    }

    showToast(`✓ ${linhas.length} linha(s) registrada(s)!`);
    buildLinhas();
    PAY_IDS.forEach(id=>document.getElementById(id).value='');
    document.getElementById('pagTotal').textContent='R$ 0,00';
    ['lTotalQtd','lTotalLinhas'].forEach(id=>document.getElementById(id).textContent='0');
    document.getElementById('lTotalVal').textContent='R$ 0,00';
    document.getElementById('fPr').value='';
    document.getElementById('pValeGas').value='';
    const elVgfReset=document.getElementById('pValeGasFuncionario');
    if (elVgfReset) elVgfReset.value='';
    _fiadoDist = [];
    renderFiadoDistLinhas();
    document.getElementById('fiadoClienteBox').style.display='none';
    if (!_pendenteSobraFalta && painelEl) painelEl.style.display='none';
  }
}

// ── DELETE ──
async function deleteLanc(id){
  if(!confirm('Remover este lançamento?')) return;
  lancamentos=lancamentos.filter(l=>l.id!==id);
  await save({type:'delete', ids:[id]}); renderTable(); renderTotals();
}

// ── DELETE GRUPO COMPLETO (data + PR) ──
async function excluirGrupoLanc(data, pr){
  const itens = lancamentos.filter(l => l.data === data && l.pr === pr);
  if (!itens.length) return;
  const dataFmt = fmtDate(data);
  if (!confirm(`⚠️ Excluir TODOS os ${itens.length} lançamento(s) de "${pr}" em ${dataFmt}?\n\nEssa ação não pode ser desfeita.`)) return;
  const idsRemovidos = itens.map(l => l.id);
  lancamentos = lancamentos.filter(l => !(l.data === data && l.pr === pr));
  await save({type:'delete', ids:idsRemovidos}); renderTable(); renderTotals();
  showToast(`🗑️ Lançamento de ${pr} (${dataFmt}) excluído!`);
}

// ── SAVE (Supabase) ──
async function save(_saveContext) {
  window._lancamentos = lancamentos;
  try {
    if (_saveContext && _saveContext.type === 'add' && _saveContext.items && _saveContext.items.length) {
      await window._saveLancamentosDocs(_saveContext.items);
    } else if (_saveContext && _saveContext.type === 'delete' && _saveContext.ids && _saveContext.ids.length) {
      await window._deleteLancamentosIds(_saveContext.ids);
    } else {
      await window._saveLancamentos();
    }
    if (window._salvarSnapshotLocal) window._salvarSnapshotLocal('auto');
  } catch(e) {
    console.error('Erro ao salvar lançamentos:', e);
    if (window._salvarSnapshotLocal) window._salvarSnapshotLocal('emergencia-supabase-falhou');
    showToast('\u26a0\ufe0f Erro ao salvar no Supabase! C\u00f3pia local salva.');
  }
}

// ── FORMAT ──
function fmtNum(v){return v.toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,'.');}
function fmtVal(v){return 'R$ '+fmtNum(v);}
function fmtDate(d){const[y,m,dd]=d.split('-');return`${dd}/${m}/${y}`;}
function sumPag(pag){return Object.values(pag||{}).reduce((a,b)=>a+b,0);}

// ── SOBRAS POR PR ──
function calcSobrasPorPR() {
  const saldo = {};
  const vendas = {};
  lancamentos.forEach(l => {
    const vid = l.vendaId != null ? l.vendaId : l.id;
    if (!vendas[vid]) vendas[vid] = { pr: l.pr, totalVenda: 0, pag: null };
    vendas[vid].totalVenda += l.total;
    if (!vendas[vid].pag) {
      const temPag = PAY_FIELDS.some(p => l.pag && l.pag[p] > 0);
      if (temPag) vendas[vid].pag = l.pag;
    }
  });
  Object.values(vendas).forEach(v => {
    const pr = v.pr;
    if (!saldo[pr]) saldo[pr] = 0;
    const totalPago = sumPag(v.pag);
    const sobrasUsadas = (v.pag && v.pag["Sobras Anteriores"]) || 0;
    const gerada = Math.round((totalPago - v.totalVenda) * 100) / 100;
    saldo[pr] += gerada;
    saldo[pr] -= sobrasUsadas;
  });
  Object.keys(saldo).forEach(p => { saldo[p] = Math.round(saldo[p] * 100) / 100; });
  return saldo;
}

// ── DIAGNÓSTICO ──
window.diagnosticoPag=function(){
  const grupos={};
  lancamentos.forEach(l=>{
    const temPag=PAY_FIELDS.some(p=>l.pag&&l.pag[p]>0);
    if(!temPag) return;
    const pagJson=JSON.stringify(PAY_FIELDS.map(p=>Math.round((l.pag&&l.pag[p]||0)*100)));
    const key=l.pr+'|'+l.data+'|'+pagJson;
    if(!grupos[key]) grupos[key]=[];
    grupos[key].push({id:l.id,vendaId:l.vendaId,qtd:l.qtd,total:l.total,pag:l.pag});
  });
  const duplicados=Object.entries(grupos).filter(([k,v])=>v.length>1);
  if(!duplicados.length){console.log('✅ Nenhum pagamento duplicado encontrado!');return;}
  console.log('⚠️ DUPLICATAS ENCONTRADAS:',duplicados.length,'grupo(s)');
  duplicados.forEach(([key,itens])=>{
    console.log('Grupo:',key);
    console.table(itens);
  });
  return duplicados;
};

window.corrigirPagDuplicado=async function(){
  let n=0;
  const grupos={};
  [...lancamentos]
    .sort((a,b)=>b.total-a.total)
    .forEach(l=>{
      const temPag=PAY_FIELDS.some(p=>l.pag&&l.pag[p]>0);
      if(!temPag) return;
      const pagJson=JSON.stringify(PAY_FIELDS.map(p=>Math.round((l.pag&&l.pag[p]||0)*100)));
      const key=l.pr+'|'+l.data+'|'+pagJson;
      if(!grupos[key]){grupos[key]=l;}
      else{
        l.pag=Object.fromEntries(PAY_FIELDS.map(p=>[p,0]));n++;
      }
    });
  if(!n){console.log('✅ Nada para corrigir!');return;}
  window._lancamentos=lancamentos;
  await window._saveLancamentos();
  renderTable();renderTotals();
  console.log('✅ Corrigidos '+n+' lançamento(s) e salvos no Supabase!');
  showToast('✅ '+n+' pagamento(s) duplicado(s) corrigido(s)!');
};

window.diagnosticoQtd=function(){
  const porVenda={};
  lancamentos.forEach(l=>{
    const vid=l.vendaId!=null?l.vendaId:l.id;
    if(!porVenda[vid]) porVenda[vid]={pr:l.pr,data:l.data,itens:[]};
    porVenda[vid].itens.push(l);
  });

  const assinaturas={};
  Object.entries(porVenda).forEach(([vid,v])=>{
    const linhasKey=v.itens.map(l=>l.qtd+'|'+l.preco+'|'+l.marca).sort().join(';');
    const key=v.pr+'|'+v.data+'|'+linhasKey;
    if(!assinaturas[key]) assinaturas[key]=[];
    assinaturas[key].push({vendaId:Number(vid),pr:v.pr,data:v.data,qtdTotal:v.itens.reduce((a,b)=>a+b.qtd,0),itens:v.itens});
  });

  const duplicados=Object.entries(assinaturas).filter(([k,v])=>v.length>1);
  if(!duplicados.length){console.log('✅ Nenhuma venda duplicada encontrada!');return[];}
  console.log('⚠️ VENDAS DUPLICADAS:',duplicados.length,'grupo(s)');
  duplicados.forEach(([key,vendas])=>{
    console.log('Grupo:',key);
    console.table(vendas.map(v=>({vendaId:v.vendaId,pr:v.pr,data:v.data,qtdTotal:v.qtdTotal})));
  });
  return duplicados;
};

window.corrigirVendasDuplicadas=async function(){
  const duplicados=window.diagnosticoQtd();
  if(!duplicados||!duplicados.length){console.log('✅ Nada para corrigir!');return;}
  const idsRemover=new Set();
  duplicados.forEach(([key,vendas])=>{
    const sorted=[...vendas].sort((a,b)=>a.vendaId-b.vendaId);
    sorted.slice(1).forEach(v=>{
      v.itens.forEach(l=>idsRemover.add(l.id));
    });
  });
  console.log('🗑️ Removendo',idsRemover.size,'linha(s) duplicada(s)...');
  lancamentos=lancamentos.filter(l=>!idsRemover.has(l.id));
  window._lancamentos=lancamentos;
  await window._saveLancamentos();
  renderTable();renderTotals();
  console.log('✅ Corrigido! Removidas',idsRemover.size,'linha(s) e salvo no Supabase!');
  showToast('✅ Vendas duplicadas removidas!');
};

window.zerarPagId=async function(id){
  const l=lancamentos.find(x=>x.id==id);
  if(!l){console.error('ID não encontrado:',id);return;}
  console.log('Antes:',JSON.stringify(l.pag));
  l.pag=Object.fromEntries(PAY_FIELDS.map(p=>[p,0]));
  window._lancamentos=lancamentos;
  await window._saveLancamentos();
  renderTable();renderTotals();
  console.log('✅ Pag zerado para id',id,'e salvo!');
  showToast('✅ Pagamento corrigido!');
};
// ══════════════════════════════════════════════════════════════
// ── MÓDULO FIADO ──────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════

async function _loadFiadoPag() {
  if (!window._fiadoPagamentos) {
    try {
      const fiados = await window._fbGetCollection('fiados');
      window._fiadoPagamentos = fiados;
    } catch(e) {
      console.warn('[_loadFiadoPag] Erro ao carregar fiados:', e.message);
      window._fiadoPagamentos = [];
    }
  }
  return window._fiadoPagamentos;
}

async function _saveFiadoPag() {
  try {
    if (window._fiadoPagamentos && window._fiadoPagamentos.length > 0) {
      await window._fbSaveCollection('fiados', window._fiadoPagamentos, f => f.id || f._fbId);
    }
  } catch(e) {
    console.error('[_saveFiadoPag] Erro ao salvar fiados:', e.message);
    throw e;
  }
}

function getQtdVendaFiado(pr, vendaId) {
  const itensVenda = lancamentos.filter(l => (l.vendaId != null ? l.vendaId : l.id) === vendaId);
  let but = 0, ult = 0;
  itensVenda.forEach(l => {
    if (l.marca === 'Butano') but += l.qtd;
    else if (l.marca === 'Ultragaz') ult += l.qtd;
  });
  return { but, ult };
}

async function calcFiadoPorPR(excludeVendaId) {
  const pags = await _loadFiadoPag();

  const fiado = {}; 
  const vistos = new Set();
  lancamentos.forEach(l => {
    const vid = l.vendaId != null ? l.vendaId : l.id;
    if (excludeVendaId != null && vid === excludeVendaId) return;
    if (vistos.has(vid)) return;
    vistos.add(vid);

    const vf = (l.pag && l.pag['Fiado']) || 0;
    if (vf > 0) {
      if (l.fiadoDistribuicao && l.fiadoDistribuicao.length) {
        // Novo formato: valor do fiado dividido entre vários clientes + restante com o PR
        let somaDistribuida = 0;
        l.fiadoDistribuicao.forEach(row => {
          if (!row.cliente || !(row.valor > 0)) return;
          somaDistribuida += row.valor;
          const chave = '👤 ' + row.cliente;
          if (!fiado[chave]) fiado[chave] = [];
          fiado[chave].push({ data: l.data, valor: row.valor, tipo: 'fiado', desc: `Venda fiado (PR: ${l.pr})`, id: vid, status: l.statusFiado || 'aberto' });
        });
        const restantePR = vf - somaDistribuida;
        if (restantePR > 0.009) {
          if (!fiado[l.pr]) fiado[l.pr] = [];
          fiado[l.pr].push({ data: l.data, valor: restantePR, tipo: 'fiado', desc: 'Venda fiado', id: vid, status: l.statusFiado || 'aberto' });
        }
      } else {
        // Formato antigo (compatibilidade): 1 valor -> 1 cliente ou PR
        const chave = l.fiadoCliente ? ('👤 ' + l.fiadoCliente) : l.pr;
        if (!fiado[chave]) fiado[chave] = [];
        fiado[chave].push({ data: l.data, valor: vf, tipo: 'fiado', desc: l.fiadoCliente ? `Venda fiado (PR: ${l.pr})` : 'Venda fiado', id: vid, status: l.statusFiado || 'aberto' });
      }
    }

    const sobraUsada = (l.pag && l.pag['Sobras Anteriores']) || 0;
    if (sobraUsada > 0.009) {
      if (!fiado[l.pr]) fiado[l.pr] = [];
      fiado[l.pr].push({
        data: l.data,
        valor: sobraUsada,
        tipo: 'fiado',
        subtipo: 'sobra_uso',
        desc: '📤 Sobra anterior utilizada nesta venda',
        id: vid + '_sobraUso',
        formasPag: null
      });
    }
  });

  pags.forEach(p => {
    if (!fiado[p.pr]) fiado[p.pr] = [];
    if (p.tipo === 'sobra') {
      fiado[p.pr].push({ data: p.data, valor: p.valor, tipo: 'pagamento', desc: p.obs || '💰 Sobra de troco', id: p.id, formasPag: null });
    } else if (p.tipo === 'falta_fiado') {
      fiado[p.pr].push({ data: p.data, valor: p.valor, tipo: 'fiado', desc: p.obs || '⚠️ Falta registrada como fiado', id: p.id, formasPag: null });
    } else {
      fiado[p.pr].push({ data: p.data, valor: p.valor, tipo: 'pagamento', desc: p.obs || 'Pagamento recebido', id: p.id, formasPag: p.formasPag || null });
    }
  });

  const resultado = {};
  Object.keys(fiado).forEach(pr => {
    const hist = [...fiado[pr]].sort((a,b) => a.data.localeCompare(b.data) || String(a.id).localeCompare(String(b.id)));
    let saldo = 0;
    const historico = hist.map(h => {
      if (h.tipo === 'fiado') saldo += h.valor;
      else saldo -= h.valor;
      return { ...h, saldoApos: saldo };
    });
    const totalFiado = hist.filter(h=>h.tipo==='fiado').reduce((a,b)=>a+b.valor,0);
    const totalPago  = hist.filter(h=>h.tipo==='pagamento').reduce((a,b)=>a+b.valor,0);
    resultado[pr] = { totalFiado, totalPago, saldo: Math.round(saldo*100)/100, historico };
  });

  return resultado;
}

async function getSobraDisponivelPR(pr, excludeVendaId) {
  if (!pr) return 0;
  const fiadoPorPR = await calcFiadoPorPR(excludeVendaId);
  const saldo = (fiadoPorPR[pr] && fiadoPorPR[pr].saldo) || 0;
  const sobra = -saldo;
  return Math.max(0, Math.round(sobra * 100) / 100);
}

async function renderFiado() {
  const resumoEl = document.getElementById('fiadoResumoCards');
  const cardsEl  = document.getElementById('fiadoPrCards');
  resumoEl.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:8px;">Carregando...</div>';
  cardsEl.innerHTML  = '';

  const dados = await calcFiadoPorPR();
  window._fiadoDadosCache = dados;
  let prs = Object.keys(dados).sort((a,b) => dados[b].saldo - dados[a].saldo);

  const filtroEl = document.getElementById('fiadoFiltroPr');
  if (filtroEl) {
    const selecionado = filtroEl.value;
    const opcoesAtuais = Array.from(filtroEl.options).map(o=>o.value).join('|');
    const novasOpcoes = Object.keys(dados).sort((a,b)=>a.localeCompare(b));
    const novasOpcoesKey = [''].concat(novasOpcoes).join('|');
    if (opcoesAtuais !== novasOpcoesKey) {
      filtroEl.innerHTML = '<option value="">Todos os PRs</option>' + novasOpcoes.map(p=>`<option value="${p}">${p}</option>`).join('');
      filtroEl.value = novasOpcoes.includes(selecionado) ? selecionado : '';
    }
    if (filtroEl.value) prs = prs.filter(p => p === filtroEl.value);
  }

  const mesEl = document.getElementById('fiadoFiltroMes');
  let mesSelecionado = '';
  if (mesEl) {
    mesSelecionado = mesEl.value;
    const mesesSet = new Set();
    Object.keys(dados).forEach(pr => dados[pr].historico.forEach(h => mesesSet.add(h.data.slice(0,7))));
    const mesesOrdenados = Array.from(mesesSet).sort().reverse();
    const nomesMes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const opcoesAtuaisMes = Array.from(mesEl.options).map(o=>o.value).join('|');
    const novasOpcoesMesKey = [''].concat(mesesOrdenados).join('|');
    if (opcoesAtuaisMes !== novasOpcoesMesKey) {
      mesEl.innerHTML = '<option value="">Todos os meses</option>' + mesesOrdenados.map(m => {
        const [y,mm] = m.split('-');
        return `<option value="${m}">${nomesMes[parseInt(mm,10)-1]}/${y}</option>`;
      }).join('');
      mesEl.value = mesesOrdenados.includes(mesSelecionado) ? mesSelecionado : '';
    }
    mesSelecionado = mesEl.value;
  }

  const statusEl = document.getElementById('fiadoFiltroStatus');
  const statusSelecionado = statusEl ? statusEl.value : '';
  const diaEl = document.getElementById('fiadoFiltroDia');
  const diaSelecionado = diaEl ? diaEl.value : '';

  const todosPrs = Object.keys(dados);
  const filtroPeriodoAtivo = !!(mesSelecionado || diaSelecionado);

  let totalDevendo, totalPRs, totalGerado, totalRecebido;
  if (filtroPeriodoAtivo || statusSelecionado) {
    totalGerado = 0; totalRecebido = 0; totalDevendo = 0; totalPRs = 0;
    todosPrs.forEach(p => {
      let hist = mesSelecionado ? dados[p].historico.filter(h => h.data.slice(0,7) === mesSelecionado) : dados[p].historico;
      if (diaSelecionado) hist = hist.filter(h => h.data === diaSelecionado);
      if (statusSelecionado) {
        hist = hist.filter(h => {
          if (h.tipo === 'fiado' && h.subtipo !== 'sobra_uso') {
            const st = h.status === 'quitado' ? 'quitado' : 'aberto';
            return st === statusSelecionado;
          }
          return true;
        });
      }
      if (!hist.length) return;
      const geradoP   = hist.filter(h => h.tipo === 'fiado').reduce((a,b)=>a+b.valor,0);
      const recebidoP = hist.filter(h => h.tipo === 'pagamento').reduce((a,b)=>a+b.valor,0);
      const saldoP = Math.round((geradoP - recebidoP) * 100) / 100;
      totalGerado += geradoP;
      totalRecebido += recebidoP;
      if (saldoP > 0) { totalDevendo += saldoP; totalPRs++; }
    });
  } else {
    totalDevendo  = todosPrs.reduce((a,p)=>a+(dados[p].saldo>0?dados[p].saldo:0),0);
    totalPRs      = todosPrs.filter(p=>dados[p].saldo>0).length;
    totalGerado   = todosPrs.reduce((a,p)=>a+dados[p].totalFiado,0);
    totalRecebido = todosPrs.reduce((a,p)=>a+dados[p].totalPago,0);
  }

  resumoEl.innerHTML = `
    <div class="summary-card" style="border:1.5px solid #fca5a5;background:var(--danger-light)">
      <div class="s-label">💸 Total em Aberto</div>
      <div class="s-value red" style="font-size:22px">${fmtVal(totalDevendo)}</div>
    </div>
    <div class="summary-card">
      <div class="s-label">👤 PRs com Saldo</div>
      <div class="s-value" style="color:var(--danger)">${totalPRs}</div>
    </div>
    <div class="summary-card">
      <div class="s-label">📒 Total Fiado Gerado</div>
      <div class="s-value" style="font-size:20px;color:var(--muted)">${fmtVal(totalGerado)}</div>
    </div>
    <div class="summary-card" style="border:1.5px solid #bbf7d0;background:var(--butano-light)">
      <div class="s-label">✅ Total Recebido</div>
      <div class="s-value green" style="font-size:20px">${fmtVal(totalRecebido)}</div>
    </div>
  `;

  if (!prs.length) {
    cardsEl.innerHTML = todosPrs.length
      ? '<div style="text-align:center;padding:40px;color:var(--muted2);font-size:13px;">Nenhum resultado para o PR selecionado.</div>'
      : '<div style="text-align:center;padding:40px;color:var(--muted2);font-size:13px;">Nenhum fiado registrado ainda. Os valores de fiado aparecem automaticamente a partir dos lançamentos.</div>';
    return;
  }

  cardsEl.innerHTML = prs.map(pr => {
    const d = dados[pr];

    let historicoFiltrado = mesSelecionado ? d.historico.filter(h => h.data.slice(0,7) === mesSelecionado) : d.historico;
    if (diaSelecionado) historicoFiltrado = historicoFiltrado.filter(h => h.data === diaSelecionado);
    if (statusSelecionado) {
      historicoFiltrado = historicoFiltrado.filter(h => {
        if (h.tipo === 'fiado' && h.subtipo !== 'sobra_uso') {
          const st = h.status === 'quitado' ? 'quitado' : 'aberto';
          return st === statusSelecionado;
        }
        return true;
      });
    }

    let totalFiadoCard, totalPagoCard, saldoCard, saldoAcumuladoCard;
    if (mesSelecionado || diaSelecionado) {
      totalFiadoCard = historicoFiltrado.filter(h => h.tipo === 'fiado').reduce((a,b)=>a+b.valor,0);
      totalPagoCard  = historicoFiltrado.filter(h => h.tipo === 'pagamento').reduce((a,b)=>a+b.valor,0);
      saldoCard = Math.round((totalFiadoCard - totalPagoCard) * 100) / 100;
      saldoAcumuladoCard = historicoFiltrado.length ? historicoFiltrado[historicoFiltrado.length-1].saldoApos : d.saldo;
    } else {
      totalFiadoCard = d.totalFiado;
      totalPagoCard  = d.totalPago;
      saldoCard = d.saldo;
      saldoAcumuladoCard = null;
    }

    const semaforo = saldoCard <= 0 ? '🟢' : '🔴';
    const corSaldo = saldoCard <= 0 ? 'var(--success)' : 'var(--danger)';
    const bgCard   = saldoCard <= 0 ? '' : 'border:1.5px solid #fca5a5;';

    if (!historicoFiltrado.length) {
      return `<div class="card" style="${bgCard}" data-pr="${pr}" data-total-fiado="0" data-total-pago="0" data-saldo="0">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:38px;height:38px;border-radius:9px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-family:'Bebas Neue',sans-serif;font-size:16px;">${pr.substring(0,2).toUpperCase()}</div>
            <div>
              <div style="font-weight:700;font-size:15px;">${semaforo} ${pr}</div>
              <div style="font-size:11px;color:var(--muted);">Sem lançamentos no mês selecionado</div>
            </div>
          </div>
        </div>
      </div>`;
    }

    const historicoHTML = historicoFiltrado.map(h => {
      const isSobraUso = h.subtipo === 'sobra_uso';
      const isFiado = h.tipo === 'fiado' && !isSobraUso;
      const isSobra = h.desc && h.desc.startsWith('💰 Sobra');
      const isFaltaFiado = h.desc && h.desc.startsWith('⚠️ Falta');
      let badgeBg, badgeColor, badgeLabel;
      if (isSobraUso) {
        badgeBg='#FFFBEB'; badgeColor='#92400E'; badgeLabel='📤 Sobra Usada';
      } else if (isFaltaFiado) {
        badgeBg='#FEF2F2'; badgeColor='var(--danger)'; badgeLabel='⚠️ Falta→Fiado';
      } else if (isFiado) {
        badgeBg='var(--danger-light)'; badgeColor='var(--danger)'; badgeLabel='📒 Fiado';
      } else if (isSobra) {
        badgeBg='#EFF6FF'; badgeColor='var(--ultra)'; badgeLabel='💰 Sobra';
      } else {
        badgeBg='var(--success-light)'; badgeColor='var(--success)'; badgeLabel='✅ Pagamento';
      }
      let formasPagHTML = '';
      if (!isFiado && !isFaltaFiado && h.formasPag) {
        const fp = h.formasPag;
        const labels = { especie:'💵 Espécie', pix:'⚡ PIX', debito:'💳 Débito', credito:'💳 Crédito', qrcode:'📱 QR Code', gasPovo:'🔥 Gás do Povo' };
        const itens = Object.entries(labels)
          .filter(([k]) => fp[k] > 0)
          .map(([k,lbl]) => `<span style="font-size:10px;background:var(--surface3);border:1px solid var(--border);border-radius:5px;padding:1px 6px;white-space:nowrap;">${lbl}: ${fmtVal(fp[k])}</span>`)
          .join(' ');
        if (itens) formasPagHTML = `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">${itens}</div>`;
      }
      const sinalValor = isFiado || isFaltaFiado || isSobraUso ? '+' : '-';
      const corValor   = isFiado || isFaltaFiado || isSobraUso ? 'var(--danger)' : 'var(--success)';
      const podeExcluir = (!isFiado || isFaltaFiado) && !isSobraUso;
      const qtd = (isFiado && !isFaltaFiado && !isSobraUso) ? getQtdVendaFiado(pr, h.id) : null;
      const butCell = qtd ? (qtd.but > 0 ? qtd.but : '-') : '-';
      const ultCell = qtd ? (qtd.ult > 0 ? qtd.ult : '-') : '-';
      return `<tr>
        <td style="padding:6px 10px;font-size:12px;color:var(--muted)">${fmtDate(h.data)}</td>
        <td style="padding:6px 10px;">
          <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:8px;background:${badgeBg};color:${badgeColor}">
            ${badgeLabel}
          </span>
        </td>
        <td style="padding:6px 10px;font-size:12px;color:var(--muted)">${h.desc}${formasPagHTML}</td>
        <td style="padding:6px 10px;font-weight:700;color:${corValor}">
          ${sinalValor}${fmtVal(h.valor)}
        </td>
        <td style="padding:6px 10px;font-weight:700;color:${h.saldoApos>0?'var(--danger)':'var(--success)'}">
          ${fmtVal(h.saldoApos)}
        </td>
        <td style="padding:6px 10px;font-size:12px;text-align:center;color:var(--butano);font-weight:700;">${butCell}</td>
        <td style="padding:6px 10px;font-size:12px;text-align:center;color:var(--ultra);font-weight:700;">${ultCell}</td>
        <td style="padding:6px 10px;">
          <div style="display:flex;gap:4px;">
            ${isFiado && !isFaltaFiado && !isSobraUso ? `<button onclick="verVendaFiado('${pr}',${h.id},${h.valor})" style="background:var(--surface3);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:3px 9px;font-size:11px;cursor:pointer;font-weight:700;" title="Ver detalhes da venda">👁️ Ver</button>` : ''}
            ${isFiado && !isFaltaFiado && !isSobraUso ? `<button onclick="abrirModalStatusFiado('${pr}',${h.id},'${h.status==='quitado'?'quitado':'aberto'}')" style="background:${h.status==='quitado'?'var(--success)':'var(--surface3)'};color:${h.status==='quitado'?'#fff':'var(--text)'};border:1px solid ${h.status==='quitado'?'var(--success)':'var(--border)'};border-radius:6px;padding:3px 9px;font-size:11px;cursor:pointer;font-weight:700;" title="Alterar status do fiado">${h.status==='quitado'?'✅ Baixado':'📌 Em aberto'}</button>` : ''}
            ${podeExcluir && !isFiado ?`
              ${!isSobra && !isFaltaFiado ? `<button onclick="editarPagFiado(${h.id})" style="background:var(--ultra-light);color:var(--ultra);border:1px solid #bfdbfe;border-radius:6px;padding:3px 9px;font-size:11px;cursor:pointer;font-weight:700;" title="Editar">✏️</button>` : ''}
              <button onclick="excluirPagFiado(${h.id})" style="background:transparent;color:var(--muted2);border:1px solid var(--border);border-radius:6px;padding:3px 9px;font-size:11px;cursor:pointer;" title="Excluir">✕</button>
            ` : ''}
          </div>
        </td>
      </tr>`;
    }).join('');

    return `
    <div class="card" style="${bgCard}" data-pr="${pr}" data-total-fiado="${totalFiadoCard}" data-total-pago="${totalPagoCard}" data-saldo="${saldoCard}">
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
        <div style="width:46px;height:46px;border-radius:12px;background:linear-gradient(135deg,var(--accent),#f5c97a);display:flex;align-items:center;justify-content:center;font-family:'Bebas Neue',sans-serif;font-size:18px;color:#fff;flex-shrink:0;">${pr.slice(0,2)}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:15px;font-weight:700;color:var(--text)">${semaforo} ${pr}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px;">Fiado gerado: ${fmtVal(totalFiadoCard)} &nbsp;|&nbsp; Recebido: ${fmtVal(totalPagoCard)}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);margin-bottom:2px;">${mesSelecionado ? 'Saldo do período' : 'Saldo em aberto'}</div>
          <div style="font-family:'Bebas Neue',sans-serif;font-size:28px;color:${corSaldo};line-height:1">${fmtVal(Math.abs(saldoCard))}${saldoCard<0?' (crédito)':''}</div>
          ${mesSelecionado ? `<div style="font-size:10px;color:var(--muted);margin-top:2px;">Acumulado até o mês: <b style="color:${saldoAcumuladoCard<=0?'var(--success)':'var(--danger)'}">${fmtVal(Math.abs(saldoAcumuladoCard))}${saldoAcumuladoCard<0?' (créd.)':''}</b></div>` : ''}
        </div>
        ${d.saldo > 0 ? `<button onclick="abrirFiadoPagModal('${pr}',${d.saldo})" style="background:var(--success);color:#fff;border:none;padding:10px 18px;border-radius:9px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;box-shadow:0 2px 8px rgba(21,128,61,.25);">💵 Registrar Pagamento</button>` : ''}
      </div>

      <div style="margin-top:14px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);margin-bottom:8px;">Histórico</div>
        <div style="overflow-x:auto;border-radius:8px;border:1px solid var(--border);">
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead style="background:var(--surface3);">
              <tr>
                <th style="padding:7px 10px;text-align:left;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);white-space:nowrap;">Data</th>
                <th style="padding:7px 10px;text-align:left;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);">Tipo</th>
                <th style="padding:7px 10px;text-align:left;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);">Descrição</th>
                <th style="padding:7px 10px;text-align:left;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);">Valor</th>
                <th style="padding:7px 10px;text-align:left;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);">Saldo</th>
                <th style="padding:7px 10px;text-align:center;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--butano);">BUT</th>
                <th style="padding:7px 10px;text-align:center;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--ultra);">ULT</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${historicoHTML}</tbody>
          </table>
        </div>
      </div>
    </div>`;
  }).join('');
}
function imprimirFiado(){
  const cardsEl = document.getElementById('fiadoPrCards');
  if (!cardsEl || !cardsEl.innerHTML.trim()) { showToast('⚠️ Não há dados para imprimir.'); return; }

  const pr  = document.getElementById('fiadoFiltroPr').value;
  const mesEl = document.getElementById('fiadoFiltroMes');
  const mesTxt = mesEl && mesEl.value ? mesEl.options[mesEl.selectedIndex].textContent : '';
  const statusEl = document.getElementById('fiadoFiltroStatus');
  const statusTxt = statusEl && statusEl.value ? statusEl.options[statusEl.selectedIndex].textContent.replace(/^[^\wÀ-ú]+\s*/,'') : '';

  const filtrosPartes = [];
  filtrosPartes.push(statusTxt ? `Status: ${statusTxt}` : 'Todos os status');
  const filtrosTxt = filtrosPartes.join(' &nbsp;|&nbsp; ');

  const conteudo = cardsEl.innerHTML
    .replace(/<button[\s\S]*?<\/button>/g, '')
    .replace(/\s(onclick|oninput|onchange)="[^"]*"/g, '')
    .replace(/\b(\d{2})\/(\d{2})\/\d{4}\b/g, '$1/$2');

  const mesFiltradoAtivo = !!(mesEl && mesEl.value);
  let totalFiadoGeral = 0, totalPagoGeral = 0, totalSaldoGeral = 0, prsComSaldo = 0;
  cardsEl.querySelectorAll('.card[data-total-fiado]').forEach(card => {
    totalFiadoGeral += parseFloat(card.getAttribute('data-total-fiado')) || 0;
    totalPagoGeral  += parseFloat(card.getAttribute('data-total-pago'))  || 0;
    const saldo = parseFloat(card.getAttribute('data-saldo')) || 0;
    totalSaldoGeral += saldo;
    if (saldo > 0) prsComSaldo++;
  });
  const rotuloSaldoTotal = mesFiltradoAtivo ? 'Saldo do Período' : 'Saldo em Aberto';
  const totaisHTML = `
    <div style="overflow-x:auto;">
    <table style="margin-top:4px;min-width:600px;">
      <thead>
        <tr>
          <th style="width:46%;">Total Geral (${prsComSaldo} PR${prsComSaldo===1?'':'s'} com saldo em aberto)</th>
          <th style="width:18%;">Fiado Gerado</th>
          <th style="width:18%;">Recebido</th>
          <th style="width:18%;">${rotuloSaldoTotal}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="font-weight:700;">TOTAIS</td>
          <td style="font-weight:700;">${fmtVal(totalFiadoGeral)}</td>
          <td style="font-weight:700;color:#166534;">${fmtVal(totalPagoGeral)}</td>
          <td style="font-weight:700;color:${totalSaldoGeral<0?'#166534':'#b91c1c'};">${fmtVal(Math.abs(totalSaldoGeral))}${totalSaldoGeral<0?' (crédito)':''}</td>
        </tr>
      </tbody>
    </table>
    </div>
    ${mesFiltradoAtivo ? `<div style="font-size:9px;color:#6b7280;margin-top:4px;">* "${rotuloSaldoTotal}" = Fiado Gerado − Recebido dentro do mês filtrado. Não representa a dívida acumulada total do PR (que pode incluir saldo de meses anteriores).</div>` : ''}`;

  const agora = new Date().toLocaleString('pt-BR');
  const dataHoraCurta = new Date().toLocaleDateString('pt-BR');

  const destaquePartes = [];
  destaquePartes.push(`<span class="dq-item"><span class="dq-lbl">PR</span><span class="dq-val">${pr ? pr : 'Todos'}</span></span>`);
  destaquePartes.push(`<span class="dq-item"><span class="dq-lbl">Mês</span><span class="dq-val">${mesTxt ? mesTxt : 'Todos'}</span></span>`);
  if (statusTxt) destaquePartes.push(`<span class="dq-item"><span class="dq-lbl">Status</span><span class="dq-val">${statusTxt}</span></span>`);
  const destaqueHTML = destaquePartes.join('');

  const win = window.open('', '_blank');
  win.document.write(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Relatório de Fiado — Controle Roberto</title>
      <style>
        * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        html, body { margin: 0; padding: 0; }
        body {
          font-family: Arial, Helvetica, sans-serif;
          color: #111;
          font-size: 12px;
          padding: 22mm 8mm 14mm 8mm;
        }
        .print-header { position: fixed; top: 0; left: 0; right: 0; height: 16mm; padding: 5mm 8mm 2mm 8mm; border-bottom: 2px solid #d97706; background: #fff; display: flex; align-items: center; justify-content: space-between; }
        .print-header .brand-title { font-size: 15px; font-weight: 700; margin: 0; color:#111; }
        .print-header .brand-sub { font-size: 9px; color:#555; margin-top: 2px; }
        .print-header .filtros { text-align:right; font-size: 9px; color:#444; line-height:1.4; }
        .print-footer { position: fixed; bottom: 0; left: 0; right: 0; height: 10mm; padding: 2mm 8mm; border-top: 1px solid #ccc; background: #fff; display: flex; align-items: center; justify-content: space-between; font-size: 8.5px; color: #777; }
        .destaque { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; background: #FFFBEB; border: 1.5px solid #d97706; border-radius: 8px; padding: 8px 12px; margin-bottom: 12px; }
        .dq-item { display:flex; align-items:baseline; gap:6px; }
        .dq-lbl { font-size: 9px; text-transform: uppercase; letter-spacing:.5px; color:#92400E; font-weight:700; }
        .dq-val { font-size: 14px; font-weight: 700; color:#111; }
        h2.section-h { font-size: 12px; margin: 4px 0 8px; color:#111; border-left: 4px solid #d97706; padding-left: 7px; }
        .card { border: 1px solid #ccc; border-radius: 7px; padding: 9px; margin-bottom: 10px; }
        table { width:100%; border-collapse: collapse; font-size: 9px; margin-top:6px; table-layout: fixed; }
        thead { display: table-header-group; }
        tr { break-inside: avoid; }
        th, td { border: 1px solid #ccc; padding: 3px 5px; text-align: left; overflow-wrap: break-word; }
        th { background:#f2f2f2; text-transform:uppercase; font-size:7.5px; }
        tr:nth-child(even) { background:#fafafa; }
        th:nth-child(1), td:nth-child(1) { width: 7%; white-space: nowrap; }
        th:nth-child(2), td:nth-child(2) { width: 12%; }
        th:nth-child(3), td:nth-child(3) { width: 34%; }
        th:nth-child(4), td:nth-child(4) { width: 11%; }
        th:nth-child(5), td:nth-child(5) { width: 11%; }
        th:nth-child(6), td:nth-child(6) { width: 8%; text-align:center; }
        th:nth-child(7), td:nth-child(7) { width: 8%; text-align:center; }
        th:last-child, td:last-child { display: none; }
        .card > div:first-child { break-inside: avoid; break-after: avoid; }
        @media print { @page { size: A4 landscape; margin: 18mm 8mm 12mm 8mm; } .print-header, .print-footer { position: fixed; } }
        @media screen { body { max-width: 1200px; margin: 0 auto; } }
      </style>
    </head>
    <body>
      <div class="print-header">
        <div>
          <div class="brand-title">📒 Controle Roberto — Relatório de Fiado</div>
          <div class="brand-sub">Documento gerado automaticamente pelo sistema</div>
        </div>
        <div class="filtros">${filtrosTxt}<br>Gerado em ${agora}</div>
      </div>

      <div class="print-footer">
        <span>Controle Roberto &mdash; Relatório de Fiado</span>
        <span>Emitido em ${dataHoraCurta}</span>
      </div>

      <div class="destaque">${destaqueHTML}</div>

      <h2 class="section-h">Detalhamento por PR</h2>
      ${conteudo}

      <h2 class="section-h" style="margin-top:14px;">Totais</h2>
      ${totaisHTML}

      <script>
        window.onload = function(){
          setTimeout(function(){ window.print(); }, 150);
        };
      <\/script>
    </body>
    </html>
  `);
  win.document.close();
}

let _vendaFiadoModalPr = '', _vendaFiadoModalId = null, _vendaFiadoModalValor = 0;

function verVendaFiado(pr, vendaId, valor) {
  const itensVenda = lancamentos.filter(l => (l.vendaId != null ? l.vendaId : l.id) === vendaId);
  if (!itensVenda.length) { showToast('⚠️ Venda não encontrada.'); return; }

  _vendaFiadoModalPr = pr;
  _vendaFiadoModalId = vendaId;
  _vendaFiadoModalValor = valor || 0;

  const grupos = {};
  itensVenda.forEach(l => {
    const nome = l.marca === 'Produto' ? (l.produto || 'Produto') : l.marca;
    const key = nome + '|' + l.preco;
    if (!grupos[key]) grupos[key] = { nome, preco: l.preco, qtd: 0, total: 0 };
    grupos[key].qtd += l.qtd;
    grupos[key].total += l.total != null ? l.total : (l.qtd * l.preco);
  });
  const linhas = Object.values(grupos);
  const totalGeral = linhas.reduce((a,g)=>a+g.total,0);

  const itensHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <tbody>
        ${linhas.map(g => `
          <tr style="border-bottom:1px solid var(--border);">
            <td style="padding:8px 10px;font-weight:600;">${g.nome}</td>
            <td style="padding:8px 10px;color:var(--muted);white-space:nowrap;">${g.qtd} × ${fmtVal(g.preco)}</td>
            <td style="padding:8px 10px;text-align:right;font-weight:700;white-space:nowrap;">${fmtVal(g.total)}</td>
          </tr>`).join('')}
        <tr>
          <td style="padding:8px 10px;font-weight:700;" colspan="2">Total</td>
          <td style="padding:8px 10px;text-align:right;font-weight:700;color:var(--danger);white-space:nowrap;">${fmtVal(totalGeral)}</td>
        </tr>
      </tbody>
    </table>`;
  document.getElementById('fiadoVendaModalItens').innerHTML = itensHTML;

  const pagTotais = {};
  itensVenda.forEach(l => {
    if (!l.pag) return;
    Object.entries(l.pag).forEach(([k,v]) => { if (v>0) pagTotais[k] = (pagTotais[k]||0) + v; });
  });
  const pagEmojis = PAY_EMOJIS || {};
  const pagHTML = Object.keys(pagTotais).length
    ? Object.entries(pagTotais).map(([k,v]) => `<span style="font-size:12px;background:var(--surface3);border:1px solid var(--border);border-radius:7px;padding:5px 10px;font-weight:600;white-space:nowrap;">${pagEmojis[k]||''} ${k}: ${fmtVal(v)}</span>`).join('')
    : '<span style="font-size:12px;color:var(--muted2);">Nenhuma forma de pagamento informada nesta venda.</span>';
  document.getElementById('fiadoVendaModalPag').innerHTML = pagHTML;

  const dataVenda = itensVenda[0].data;
  document.getElementById('fiadoVendaModalSub').textContent = `${pr} — ${fmtDate(dataVenda)}`;
  document.getElementById('fiadoVendaModal').style.display = 'flex';
}

function darBaixaVendaFiado() {
  const pr = _vendaFiadoModalPr;
  if (!pr) return;
  document.getElementById('fiadoVendaModal').style.display = 'none';
  const d = (window._fiadoDadosCache || {})[pr];
  const saldo = d ? d.saldo : _vendaFiadoModalValor;
  abrirFiadoPagModal(pr, saldo);
  if (_vendaFiadoModalValor > 0) {
    document.getElementById('fpEspecie').value = _vendaFiadoModalValor;
    calcFiadoPagTotal();
  }
}

let _fiadoPagPrAtual = '', _fiadoPagSaldoAtual = 0, _fiadoPagEditId = null;

const FP_IDS = ['fpEspecie','fpPix','fpDebito','fpCredito','fpQrcode','fpGasPovo'];
const FP_FIELDS = ['especie','pix','debito','credito','qrcode','gasPovo'];

function calcFiadoPagTotal() {
  let t = 0;
  FP_IDS.forEach(id => t += parseFloat(document.getElementById(id).value)||0);
  document.getElementById('fiadoPagTotalVal').textContent = fmtVal(t);
  const box = document.getElementById('fiadoPagTotalBox');
  box.style.display = t > 0 ? 'flex' : 'none';
  return t;
}

function _limparFiadoPagForm() {
  FP_IDS.forEach(id => document.getElementById(id).value = '');
  document.getElementById('fiadoPagObs').value = '';
  document.getElementById('fiadoPagErr').textContent = '';
  document.getElementById('fiadoPagTotalBox').style.display = 'none';
  document.getElementById('fiadoPagTotalVal').textContent = 'R$ 0,00';
}

function abrirFiadoPagModal(pr, saldo) {
  _fiadoPagPrAtual = pr;
  _fiadoPagSaldoAtual = saldo;
  _fiadoPagEditId = null;
  document.getElementById('fiadoPagModalTitle').textContent = '💵 Registrar Pagamento de Fiado';
  document.getElementById('fiadoPagPrNome').textContent = pr;
  document.getElementById('fiadoPagData').value = hojeLocal();
  document.getElementById('fiadoPagSaldoInfo').textContent = `Saldo em aberto de ${pr}: ${fmtVal(saldo)}`;
  _limparFiadoPagForm();
  document.getElementById('fiadoPagModal').style.display = 'flex';
  setTimeout(()=>document.getElementById('fpEspecie').focus(), 100);
}

function abrirFiadoPagEditModal(pag) {
  _fiadoPagPrAtual = pag.pr;
  _fiadoPagSaldoAtual = 0;
  _fiadoPagEditId = pag.id;
  document.getElementById('fiadoPagModalTitle').textContent = '✏️ Editar Pagamento de Fiado';
  document.getElementById('fiadoPagPrNome').textContent = pag.pr;
  document.getElementById('fiadoPagData').value = pag.data || '';
  document.getElementById('fiadoPagObs').value = pag.obs || '';
  document.getElementById('fiadoPagSaldoInfo').textContent = `Editando pagamento de ${pag.pr}`;
  document.getElementById('fiadoPagSaldoInfo').style.background = 'var(--ultra-light)';
  document.getElementById('fiadoPagSaldoInfo').style.borderColor = '#bfdbfe';
  document.getElementById('fiadoPagSaldoInfo').style.color = 'var(--ultra)';
  _limparFiadoPagForm();
  const fp = pag.formasPag || {};
  FP_FIELDS.forEach((f,i) => {
    const v = fp[f] || 0;
    if (v > 0) document.getElementById(FP_IDS[i]).value = v;
  });
  if (!Object.values(fp).some(v=>v>0) && pag.valor > 0) {
    document.getElementById('fpEspecie').value = pag.valor;
  }
  calcFiadoPagTotal();
  document.getElementById('fiadoPagErr').textContent = '';
  document.getElementById('fiadoPagModal').style.display = 'flex';
}

function fecharFiadoPagModal() {
  document.getElementById('fiadoPagModal').style.display = 'none';
  document.getElementById('fiadoPagSaldoInfo').style.background = 'var(--danger-light)';
  document.getElementById('fiadoPagSaldoInfo').style.borderColor = '#fca5a5';
  document.getElementById('fiadoPagSaldoInfo').style.color = 'var(--danger)';
}

let _fiadoStatusVendaId = null;
let _fiadoStatusPr = null;

function abrirModalStatusFiado(pr, vendaId, statusAtual) {
  _fiadoStatusVendaId = vendaId;
  _fiadoStatusPr = pr;

  document.getElementById('fiadoStatusInfo').innerHTML = `
    <strong style="color:var(--text);">${pr}</strong><br>
    Status atual: <strong style="color:${statusAtual==='quitado'?'var(--success)':'var(--danger)'}">${statusAtual==='quitado' ? '✅ Baixado' : '📌 Em aberto'}</strong>
  `;

  const btnBaixar  = document.getElementById('btnFiadoBaixar');
  const btnReabrir = document.getElementById('btnFiadoReabrir');
  btnBaixar.style.opacity  = statusAtual === 'quitado' ? '0.5' : '1';
  btnReabrir.style.opacity = statusAtual === 'quitado' ? '1'   : '0.5';

  document.getElementById('fiadoStatusModal').style.display = 'flex';
}

async function definirStatusFiado(novoStatus) {
  if (_fiadoStatusVendaId === null) {
    alert('❌ Erro: nenhuma venda selecionada.');
    return;
  }

  try {
    const alvos = lancamentos.filter(l => (l.vendaId != null ? l.vendaId : l.id) === _fiadoStatusVendaId);

    if (!alvos.length) {
      alert('❌ Lançamento não encontrado!');
      return;
    }

    alvos.forEach(l => { l.statusFiado = novoStatus; });

    window._lancamentos = lancamentos;
    if (typeof window._saveLancamentosDocs === 'function') {
      await window._saveLancamentosDocs(alvos);
    } else {
      await window._saveLancamentos();
    }

    showToast(novoStatus === 'quitado' ? `✅ Fiado de ${_fiadoStatusPr} marcado como BAIXADO` : `↩️ Fiado de ${_fiadoStatusPr} reaberto`);

    document.getElementById('fiadoStatusModal').style.display = 'none';
    _fiadoStatusVendaId = null;
    _fiadoStatusPr = null;

    if (typeof renderFiado === 'function') renderFiado();
  } catch (e) {
    console.error('[definirStatusFiado] Erro:', e);
    alert(`❌ Erro ao salvar status: ${e.message}`);
  }
}

async function confirmarPagFiado() {
  const data  = document.getElementById('fiadoPagData').value;
  const obs   = document.getElementById('fiadoPagObs').value.trim();
  const err   = document.getElementById('fiadoPagErr');
  if (!data) { err.textContent = '⚠ Informe a data.'; return; }

  const formasPag = {};
  let total = 0;
  FP_FIELDS.forEach((f,i) => {
    const v = parseFloat(document.getElementById(FP_IDS[i]).value)||0;
    formasPag[f] = v;
    total += v;
  });
  if (total <= 0) { err.textContent = '⚠ Informe pelo menos uma forma de pagamento.'; return; }
  err.textContent = '';

  const pags = await _loadFiadoPag();
  if (_fiadoPagEditId !== null) {
    const idx = pags.findIndex(p => p.id === _fiadoPagEditId);
    if (idx !== -1) {
      pags[idx] = { ...pags[idx], data, obs, formasPag, valor: total };
    }
    window._fiadoPagamentos = pags;
    await _saveFiadoPag();
    fecharFiadoPagModal();
    showToast(`✅ Pagamento atualizado!`);
  } else {
    const novoPag = { id: Date.now(), pr: _fiadoPagPrAtual, data, valor: total, obs, formasPag };
    pags.push(novoPag);
    window._fiadoPagamentos = pags;
    await _saveFiadoPag();
    fecharFiadoPagModal();
    showToast(`✅ Pagamento de ${fmtVal(total)} registrado para ${_fiadoPagPrAtual}!`);
  }
  renderFiado();
  if (typeof renderDeposito === 'function') renderDeposito();
}

async function excluirPagFiado(id) {
  if (!confirm('Remover este pagamento?')) return;
  const pags = await _loadFiadoPag();
  window._fiadoPagamentos = pags.filter(p => p.id !== id);
  await _saveFiadoPag();
  showToast('✅ Pagamento removido!');
  renderFiado();
  if (typeof renderDeposito === 'function') renderDeposito();
}

async function editarPagFiado(id) {
  const pags = await _loadFiadoPag();
  const pag = pags.find(p => p.id === id);
  if (!pag) return;
  abrirFiadoPagEditModal(pag);
}
// ── FILTROS LANÇAMENTOS ──
function limparFiltrosLanc(){
  const d=document.getElementById('lFiltData');
  const pr=document.getElementById('lFiltPr');
  if(d) d.value='';
  if(pr) pr.value='';
  renderTable();
}

function populateLancFiltPr(){
  const sel=document.getElementById('lFiltPr');
  if(!sel) return;
  const cur=sel.value;
  sel.innerHTML='<option value="">Todos os PRs</option>';
  [...PRS].sort().forEach(p=>{const o=document.createElement('option');o.value=p;o.textContent=p;sel.appendChild(o);});
  if(cur) sel.value=cur;
}

// ── RENDER TABLE (agrupado por data+PR) ──
function renderTable(){
  populateLancFiltPr();
  const tb=document.getElementById('tbodyLanc');
  if(!lancamentos.length){tb.innerHTML='<tr><td colspan="8" class="empty">Nenhum lançamento ainda.</td></tr>';return;}

  const filtData=document.getElementById('lFiltData')?.value||'';
  const filtPr=document.getElementById('lFiltPr')?.value||'';

  let lista=[...lancamentos];
  if(filtData) lista=lista.filter(l=>l.data===filtData);
  if(filtPr) lista=lista.filter(l=>l.pr===filtPr);

  if(!lista.length){tb.innerHTML='<tr><td colspan="17" class="empty">Nenhum lançamento para os filtros selecionados.</td></tr>';renderTotals();return;}

  const grupos={};
  lista.forEach(l=>{
    const key=l.data+'__'+l.pr;
    if(!grupos[key]) grupos[key]={data:l.data,pr:l.pr,itens:[]};
    grupos[key].itens.push(l);
  });

  const gruposArr=Object.values(grupos).sort((a,b)=>{
    if(b.data!==a.data) return b.data.localeCompare(a.data);
    return a.pr.localeCompare(b.pr);
  });

  tb.innerHTML=gruposArr.map(g=>{
    const gDataAttr=String(g.data).replace(/'/g,"\\'");
    const gPrAttr=String(g.pr).replace(/'/g,"\\'");
    const qtdTotal=g.itens.filter(l=>l.marca==='Ultragaz'||l.marca==='Butano').reduce((s,l)=>s+l.qtd,0);
    const valorTotal=g.itens.reduce((s,l)=>s+l.total,0);

    const vistosV=new Set();
    let totalPago=0,totalFiado=0,pagEspecie=0,pagDebito=0,pagCredito=0,pagQrCode=0,pagPix=0,pagMoeda=0,pagGasPovo=0,pagSobrasAnt=0,totalValeGas=0;
    g.itens.forEach(l=>{
      const vid=l.vendaId!=null?l.vendaId:l.id;
      if(!vistosV.has(vid)){
        vistosV.add(vid);
        totalPago+=sumPag(l.pag);
        totalFiado+=(l.pag&&l.pag['Fiado']||0);
        pagEspecie+=(l.pag&&l.pag['Espécie']||0);
        pagDebito+=(l.pag&&l.pag['Débito']||0);
        pagCredito+=(l.pag&&l.pag['Crédito']||0);
        pagQrCode+=(l.pag&&l.pag['QR Code']||0);
        pagPix+=(l.pag&&l.pag['Pix']||0);
        pagMoeda+=(l.pag&&l.pag['Moeda']||0);
        pagGasPovo+=(l.pag&&l.pag['Gás do Povo']||0);
        pagSobrasAnt+=(l.pag&&l.pag['Sobras Anteriores']||0);
        totalValeGas+=(l.valeGas||0);
      }
    });

    const marcas=[...new Set(g.itens.map(l=>l.marca))];
    const marcaBadges=marcas.map(m=>{
      if(m==='Ultragaz') return `<span class="badge badge-ultra">Ultra</span>`;
      if(m==='Butano')   return `<span class="badge badge-butano">Butano</span>`;
      if(m==='Produto'){
        const prods=[...new Set(g.itens.filter(l=>l.marca==='Produto').map(l=>l.produto||'Produto'))];
        return prods.map(p=>`<span class="badge badge-produto">📦 ${p}</span>`).join(' ');
      }
      return `<span class="badge">${m}</span>`;
    }).join(' ');

  return `<tr>
      <td>${fmtDate(g.data)}</td>
      <td style="font-weight:700;white-space:nowrap"><button class="btn-sm-edit" title="Editar venda" onclick="carregarEdicaoNoForm('${gDataAttr}','${gPrAttr}')" style="vertical-align:middle;margin-right:5px;">✏️</button>${g.pr}</td>
      <td style="font-family:'Bebas Neue',sans-serif;font-size:18px;color:var(--text)">${qtdTotal}</td>
      <td style="font-weight:700;color:var(--success)">${fmtVal(valorTotal)}</td>
      <td>${marcaBadges}</td>
      <td style="color:var(--muted)">${pagEspecie>0?fmtVal(pagEspecie):'-'}</td>
      <td style="color:var(--muted)">${pagDebito>0?fmtVal(pagDebito):'-'}</td>
      <td style="color:var(--muted)">${pagCredito>0?fmtVal(pagCredito):'-'}</td>
      <td style="color:var(--muted)">${pagQrCode>0?fmtVal(pagQrCode):'-'}</td>
      <td style="color:var(--muted)">${pagPix>0?fmtVal(pagPix):'-'}</td>
      <td style="color:var(--muted)">${pagMoeda>0?fmtVal(pagMoeda):'-'}</td>
      <td style="color:var(--danger);font-weight:${totalFiado>0?'700':'400'}">${totalFiado>0?fmtVal(totalFiado):'-'}</td>
      <td style="color:var(--muted)">${pagGasPovo>0?fmtVal(pagGasPovo):'-'}</td>
      <td style="color:var(--muted)">${pagSobrasAnt>0?fmtVal(pagSobrasAnt):'-'}</td>
      <td style="color:var(--muted);font-weight:${totalValeGas>0?'700':'400'}">${totalValeGas>0?totalValeGas:'-'}</td>
      <td style="font-weight:700;color:var(--accent)">${totalPago>0?fmtVal(totalPago):'-'}</td>
      <td style="white-space:nowrap">
        <button class="btn-sm-del" title="Excluir lançamento completo" onclick="event.stopPropagation();event.preventDefault();excluirGrupoLanc('${gDataAttr}','${gPrAttr}');return false;">🗑️</button>
      </td>
    </tr>`;
  }).join('');
  renderTotals();
}

let _grupoAtualData='', _grupoAtualPr='';
function abrirGrupoLanc(data, pr){
  _grupoAtualData=data; _grupoAtualPr=pr;
  const itens=lancamentos.filter(l=>l.data===data&&l.pr===pr);
  document.getElementById('grupoLancSubtitulo').textContent=`${fmtDate(data)} — ${pr} — ${itens.length} linha(s)`;

  const vistos=new Set();
  document.getElementById('tbodyGrupoLanc').innerHTML=itens.map(l=>{
    const vid=l.vendaId!=null?l.vendaId:l.id;
    const isPrimeira=!vistos.has(vid);
    if(isPrimeira) vistos.add(vid);
    const pagExibir=isPrimeira?l.pag:null;
    const totalPago=isPrimeira?sumPag(l.pag):null;
    return `<tr>
      <td style="font-family:'Bebas Neue',sans-serif;font-size:18px">${l.qtd}</td>
      <td>${fmtVal(l.preco)}</td>
      <td style="font-weight:700;color:var(--success)">${fmtVal(l.total)}</td>
      <td><span class="badge badge-${l.marca==='Ultragaz'?'ultra':l.marca==='Butano'?'butano':'produto'}">${l.marca==='Produto'?('📦 '+(l.produto||'Produto')):l.marca}</span></td>
      ${PAY_FIELDS.map(p=>`<td style="color:${p==='Fiado'?'var(--danger)':'var(--muted)'}">${pagExibir&&pagExibir[p]>0?fmtVal(pagExibir[p]):'-'}</td>`).join('')}
      <td style="font-weight:700;color:var(--accent)">${totalPago!=null?fmtVal(totalPago):'-'}</td>
      <td style="white-space:nowrap">
        <button class="btn-sm-del" onclick="deleteLancGrupo(${l.id},'${data}','${pr}')">✕</button>
      </td>
    </tr>`;
  }).join('');

  document.getElementById('grupoLancModal').style.display='flex';
}

function abrirGrupoLancEditar(data, pr){
  fecharGrupoLanc();
  abrirEdicaoGrupoComDados(data, pr);
}

function abrirEdicaoGrupo(){
  abrirEdicaoGrupoComDados(_grupoAtualData, _grupoAtualPr);
}

async function deleteLancGrupo(id,data,pr){
  if(!confirm('Remover este lançamento?')) return;
  lancamentos=lancamentos.filter(l=>l.id!==id);
  await save({type:'delete', ids:[id]}); renderTable(); renderTotals();
  const restantes=lancamentos.filter(l=>l.data===data&&l.pr===pr);
  if(restantes.length) abrirGrupoLanc(data,pr);
  else fecharGrupoLanc();
  showToast('✓ Lançamento removido!');
}

function fecharGrupoLanc(){
  document.getElementById('grupoLancModal').style.display='none';
}

// ── TOTALS BAR ──
function renderTotals(){
  const fonte = (window._lancamentos && window._lancamentos.length) ? window._lancamentos : lancamentos;

  const filtDataEl = document.getElementById('lFiltData');
  const filtData = filtDataEl ? filtDataEl.value : '';
  const diaRef = filtData || hojeLocal();

  const sufixo = filtData ? (() => { const [y,m,d]=diaRef.split('-'); return d+'/'+m; })() : 'Hoje';
  ['tlBotijoes','tlValor','tlUltra','tlButano','tlFiado','tlValeGas'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = el.dataset.base + ' ' + sufixo;
  });

  const t = fonte.filter(l => l.data === diaRef);

  const vistosT = new Set();
  const totalFiado = t.reduce((a,l) => {
    const vid = l.vendaId != null ? l.vendaId : l.id;
    if (!vistosT.has(vid)) { vistosT.add(vid); return a + (l.pag && l.pag['Fiado'] || 0); }
    return a;
  }, 0);
  const vistosVG = new Set();
  const totalValeGas = t.reduce((a,l) => {
    const vid = l.vendaId != null ? l.vendaId : l.id;
    if (!vistosVG.has(vid)) { vistosVG.add(vid); return a + (l.valeGas || 0); }
    return a;
  }, 0);
  document.getElementById('tqtd').textContent    = t.filter(l=>l.marca!=='Produto').reduce((a,b) => a + b.qtd, 0);
  document.getElementById('tval').textContent    = fmtVal(t.reduce((a,b) => a + b.total, 0));
  document.getElementById('tqultra').textContent = t.filter(l => l.marca === 'Ultragaz').reduce((a,b) => a + b.qtd, 0);
  document.getElementById('tqbutano').textContent= t.filter(l => l.marca === 'Butano').reduce((a,b) => a + b.qtd, 0);
  document.getElementById('tfiado').textContent  = fmtVal(totalFiado);
  document.getElementById('tvalegas').textContent = totalValeGas;
}
window.renderTotals = renderTotals;

// ── LIMPAR FIADOS ──────────────────────────────────────────────
function abrirModalLimparFiado() {
  document.getElementById('limparFiadoStep1').style.display = '';
  document.getElementById('limparFiadoStep2').style.display = 'none';
  document.querySelectorAll('input[name="limparOpcao"]').forEach(r => r.checked = false);
  document.getElementById('btnLimparFiadoProximo').disabled = true;
  document.getElementById('btnLimparFiadoProximo').style.opacity = '.4';
  const travaEl = document.getElementById('limparFiadoTrava');
  if (travaEl) travaEl.value = '';
  const confirmBtn = document.getElementById('btnLimparFiadoConfirmar');
  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.style.opacity = '.4'; }
  ['optPagLabel','optTudoLabel'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.borderColor = 'var(--border)';
  });
  document.getElementById('limparFiadoModal').style.display = 'flex';
}

function fecharModalLimparFiado() {
  document.getElementById('limparFiadoModal').style.display = 'none';
}

function limparFiadoOpcaoChange() {
  const val = document.querySelector('input[name="limparOpcao"]:checked')?.value;
  const btn = document.getElementById('btnLimparFiadoProximo');
  btn.disabled = !val;
  btn.style.opacity = val ? '1' : '.4';
  document.getElementById('optPagLabel').style.borderColor  = val==='pagamentos' ? 'var(--danger)' : 'var(--border)';
  document.getElementById('optTudoLabel').style.borderColor = val==='tudo'        ? 'var(--danger)' : 'var(--border)';
}

function limparFiadoStep2() {
  document.getElementById('limparFiadoStep1').style.display = 'none';
  document.getElementById('limparFiadoStep2').style.display = '';
  document.getElementById('limparFiadoTrava').value = '';
  document.getElementById('limparFiadoTrava').focus();
  const btn = document.getElementById('btnLimparFiadoConfirmar');
  btn.disabled = true; btn.style.opacity = '.4';
}

function limparFiadoVoltarStep1() {
  document.getElementById('limparFiadoStep2').style.display = 'none';
  document.getElementById('limparFiadoStep1').style.display = '';
}

function limparFiadoTravaCheck() {
  const val = document.getElementById('limparFiadoTrava').value.trim().toUpperCase();
  const btn = document.getElementById('btnLimparFiadoConfirmar');
  const ok  = val === 'LIMPAR FIADO';
  btn.disabled = !ok;
  btn.style.opacity = ok ? '1' : '.4';
}

async function executarLimparFiado() {
  const opcao = document.querySelector('input[name="limparOpcao"]:checked')?.value;
  if (!opcao) return;

  fecharModalLimparFiado();
  showToast('⏳ Limpando...');

  try {
    window._fiadoPagamentos = [];
    await window._fbSetDoc('config', 'fiado_pagamentos', { lista: [] });

    if (opcao === 'tudo') {
      lancamentos.forEach(l => {
        if (l.pag && l.pag['Fiado'] > 0) {
          l.pag['Fiado'] = 0;
        }
      });
      window._lancamentos = lancamentos;
      await window._saveLancamentos();
      renderTable();
      renderTotals();
      showToast('✅ Todos os fiados foram apagados!');
    } else {
      showToast('✅ Pagamentos e registros de fiado apagados!');
    }

    if (typeof renderFiado === 'function' && document.getElementById('tab-fiado')?.classList.contains('active')) {
      renderFiado();
    }
  } catch(e) {
    console.error('Erro ao limpar fiados:', e);
    showToast('❌ Erro ao limpar. Tente novamente.');
  }
}
// ── CHART INSTANCES ──
let chartUltraInst=null, chartButanoInst=null, chartPRInst=null;

function destroyCharts(){
  if(chartUltraInst){chartUltraInst.destroy();chartUltraInst=null;}
  if(chartButanoInst){chartButanoInst.destroy();chartButanoInst=null;}
  if(chartPRInst){chartPRInst.destroy();chartPRInst=null;}
}

function renderCharts(f){
  destroyCharts();
  Chart.register(ChartDataLabels);

  const mesVal=document.getElementById('rFiltMes').value;
  let anoRef;
  if(mesVal) anoRef=mesVal.slice(0,4);
  else if(f.length){
    const anos={};
    f.forEach(l=>{const a=l.data.slice(0,4);anos[a]=(anos[a]||0)+1;});
    anoRef=Object.keys(anos).sort((a,b)=>anos[b]-anos[a])[0];
  } else anoRef=new Date().getFullYear().toString();

  const mesesLabels=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const prFilt=document.getElementById('rFiltPr').value;
  let base=[...lancamentos].filter(l=>l.data.startsWith(anoRef));
  if(prFilt) base=base.filter(l=>l.pr===prFilt);

  const dataUltra=Array(12).fill(0);
  const dataButano=Array(12).fill(0);
  base.forEach(l=>{
    const mo=parseInt(l.data.slice(5,7),10)-1;
    if(l.marca==='Ultragaz') dataUltra[mo]+=l.qtd;
    if(l.marca==='Butano')   dataButano[mo]+=l.qtd;
  });

  function makeDatalabels(color){
    return{
      display:ctx=>ctx.dataset.data[ctx.dataIndex]>0,
      anchor:ctx=>{const v=ctx.dataset.data[ctx.dataIndex];const max=Math.max(...ctx.dataset.data);return v/max>0.25?'center':'end';},
      align:ctx=>{const v=ctx.dataset.data[ctx.dataIndex];const max=Math.max(...ctx.dataset.data);return v/max>0.25?'center':'top';},
      offset:0,
      font:{size:12,weight:'700'},
      color:ctx=>{const v=ctx.dataset.data[ctx.dataIndex];const max=Math.max(...ctx.dataset.data);return v/max>0.25?'#fff':color;},
      formatter:v=>v,
      textStrokeColor:ctx=>{const v=ctx.dataset.data[ctx.dataIndex];const max=Math.max(...ctx.dataset.data);return v/max>0.25?'rgba(0,0,0,0.2)':'transparent';},
      textStrokeWidth:2
    };
  }

  const scaleCommon={
    x:{grid:{display:false},ticks:{font:{size:10}}},
    y:{beginAtZero:true,ticks:{stepSize:1,font:{size:10}},grid:{color:'#f0f2f7'},grace:'15%'}
  };

  chartUltraInst=new Chart(document.getElementById('chartUltra'),{
    type:'bar',
    data:{
      labels:mesesLabels,
      datasets:[{
        data:dataUltra,
        backgroundColor:mesesLabels.map((_,i)=>dataUltra[i]>0?'rgba(29,78,216,0.80)':'rgba(29,78,216,0.12)'),
        borderColor:'#1d4ed8',borderWidth:1.5,borderRadius:6,
      }]
    },
    options:{
      responsive:true,maintainAspectRatio:true,
      layout:{padding:{top:8}},
      plugins:{
        legend:{display:false},
        datalabels:makeDatalabels('#1d4ed8'),
        tooltip:{callbacks:{label:ctx=>`${ctx.parsed.y} botijões Ultragaz`}}
      },
      scales:scaleCommon
    }
  });

  chartButanoInst=new Chart(document.getElementById('chartButano'),{
    type:'bar',
    data:{
      labels:mesesLabels,
      datasets:[{
        data:dataButano,
        backgroundColor:mesesLabels.map((_,i)=>dataButano[i]>0?'rgba(21,128,61,0.80)':'rgba(21,128,61,0.12)'),
        borderColor:'#15803d',borderWidth:1.5,borderRadius:6,
      }]
    },
    options:{
      responsive:true,maintainAspectRatio:true,
      layout:{padding:{top:8}},
      plugins:{
        legend:{display:false},
        datalabels:makeDatalabels('#15803d'),
        tooltip:{callbacks:{label:ctx=>`${ctx.parsed.y} botijões Butano`}}
      },
      scales:scaleCommon
    }
  });

  const prQtds={};
  f.forEach(l=>{prQtds[l.pr]=(prQtds[l.pr]||0)+l.qtd;});
  const prsSorted=Object.entries(prQtds).sort((a,b)=>b[1]-a[1]);
  const prLabels=prsSorted.map(x=>x[0]);
  const prVals=prsSorted.map(x=>x[1]);
  const palette=['#e07b00','#1d4ed8','#15803d','#dc2626','#7c3aed','#0891b2','#be185d','#d97706','#059669','#2563eb','#9333ea','#db2777','#16a34a','#ea580c','#f59e0b'];

  const chartHeight=Math.max(200, prLabels.length*38+60);
  const wrap=document.getElementById('chartPRWrap');
  wrap.style.height=chartHeight+'px';

  chartPRInst=new Chart(document.getElementById('chartPR'),{
    type:'bar',
    data:{
      labels:prLabels,
      datasets:[{
        data:prVals,
        backgroundColor:prLabels.map((_,i)=>palette[i%palette.length]+'dd'),
        borderColor:prLabels.map((_,i)=>palette[i%palette.length]),
        borderWidth:1.5,borderRadius:5,
      }]
    },
    options:{
      indexAxis:'y',
      responsive:true,maintainAspectRatio:false,
      layout:{padding:{right:50}},
      plugins:{
        legend:{display:false},
        datalabels:{
          display:ctx=>ctx.dataset.data[ctx.dataIndex]>0,
          anchor:'end',align:'right',offset:4,
          font:{size:11,weight:'700'},
          color:ctx=>palette[ctx.dataIndex%palette.length],
          formatter:v=>`${v} bot.`
        },
        tooltip:{callbacks:{label:ctx=>`${ctx.parsed.x} botijões`}}
      },
      scales:{
        x:{beginAtZero:true,ticks:{font:{size:10},stepSize:1},grid:{color:'#f0f2f7'},grace:'10%'},
        y:{grid:{display:false},ticks:{font:{size:11,weight:'600'},color:'#374151'}}
      }
    }
  });
}

function renderRanking(f){
  const prTotais={};
  const prQtds={};
  f.forEach(l=>{
    prTotais[l.pr]=(prTotais[l.pr]||0)+l.total;
    prQtds[l.pr]=(prQtds[l.pr]||0)+l.qtd;
  });
  const top5=Object.entries(prTotais).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const maxVal=top5[0]?top5[0][1]:1;
  const medals=['🥇','🥈','🥉','4º','5º'];
  const posClass=['gold','silver','bronze','p4','p5'];
  document.getElementById('rankingList').innerHTML=top5.length
    ? top5.map(([pr,val],i)=>`
      <div class="rank-item">
        <div class="rank-pos ${posClass[i]}">${medals[i]}</div>
        <div class="rank-info">
          <div class="rank-name">${pr}</div>
          <div class="rank-sub">${prQtds[pr]} botijão(s) vendido(s)</div>
          <div class="rank-bar-wrap"><div class="rank-bar" style="width:${Math.round(val/maxVal*100)}%"></div></div>
        </div>
        <div class="rank-val">${fmtVal(val)}</div>
      </div>`).join('')
    : '<div class="empty">Nenhum dado para o filtro selecionado.</div>';
}

const MESES_PT=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
function buildMesOptions(){
  const sel=document.getElementById('rFiltMes');
  const meses=new Set(lancamentos.map(l=>l.data.slice(0,7)));
  const sorted=[...meses].sort().reverse();
  const cur=sel.value;
  sel.innerHTML='<option value="">Todos os meses</option>';
  sorted.forEach(m=>{
    const [y,mo]=m.split('-');
    const o=document.createElement('option');
    o.value=m; o.textContent=`${MESES_PT[parseInt(mo,10)-1]} ${y}`;
    if(m===cur) o.selected=true;
    sel.appendChild(o);
  });
}
const FP_TO_PAY = { especie: 'Espécie', pix: 'Pix', debito: 'Débito', credito: 'Crédito', qrcode: 'QR Code', gasPovo: 'Gás do Povo' };

async function renderResumo(){
  buildMesOptions();
  let f=[...lancamentos];
  const pr   =document.getElementById('rFiltPr').value;
  const marca=document.getElementById('rFiltMarca').value;
  const mes  =document.getElementById('rFiltMes').value;
  const dia  =document.getElementById('rFiltDia')?.value||'';
  if(pr)    f=f.filter(l=>l.pr===pr);
  if(marca) f=f.filter(l=>l.marca===marca);
  if(dia)   f=f.filter(l=>l.data===dia);
  else if(mes) f=f.filter(l=>l.data.startsWith(mes));

  let fiadoPagsFiltrados = [];
  if (!marca) {
    const _todosFiadoPags = await _loadFiadoPag();
    fiadoPagsFiltrados = _todosFiadoPags.filter(p => p.tipo !== 'sobra' && p.tipo !== 'falta_fiado' && p.formasPag);
    if (pr)      fiadoPagsFiltrados = fiadoPagsFiltrados.filter(p => p.pr === pr);
    if (dia)     fiadoPagsFiltrados = fiadoPagsFiltrados.filter(p => p.data === dia);
    else if(mes) fiadoPagsFiltrados = fiadoPagsFiltrados.filter(p => p.data && p.data.startsWith(mes));
  }

  document.getElementById('summaryCards').innerHTML=`
    <div class="summary-card"><div class="s-label">Total Botijões</div><div class="s-value">${f.filter(l=>l.marca==='Ultragaz'||l.marca==='Butano').reduce((a,b)=>a+b.qtd,0)}</div></div>
    <div class="summary-card"><div class="s-label">Valor Total</div><div class="s-value green">${fmtVal(f.reduce((a,b)=>a+b.total,0))}</div></div>
    <div class="summary-card"><div class="s-label">Ultragaz Qtd</div><div class="s-value blue">${f.filter(l=>l.marca==='Ultragaz').reduce((a,b)=>a+b.qtd,0)}</div></div>
    <div class="summary-card"><div class="s-label">Ultragaz Valor</div><div class="s-value blue" style="font-size:18px">${fmtVal(f.filter(l=>l.marca==='Ultragaz').reduce((a,b)=>a+b.total,0))}</div></div>
    <div class="summary-card"><div class="s-label">Butano Qtd</div><div class="s-value bgreen">${f.filter(l=>l.marca==='Butano').reduce((a,b)=>a+b.qtd,0)}</div></div>
    <div class="summary-card"><div class="s-label">Butano Valor</div><div class="s-value bgreen" style="font-size:18px">${fmtVal(f.filter(l=>l.marca==='Butano').reduce((a,b)=>a+b.total,0))}</div></div>
    <div class="summary-card"><div class="s-label">Total Fiado</div><div class="s-value red">${fmtVal(f.reduce((a,b)=>a+(b.pag&&b.pag['Fiado']||0),0))}</div></div>
    <div class="summary-card"><div class="s-label">Preço Médio Ultra</div><div class="s-value blue" style="font-size:18px">${(()=>{const itens=f.filter(l=>l.marca==='Ultragaz');const qtd=itens.reduce((a,b)=>a+b.qtd,0);const val=itens.reduce((a,b)=>a+b.total,0);return qtd>0?fmtVal(val/qtd):'—';})()}</div></div>
    <div class="summary-card"><div class="s-label">Preço Médio Butano</div><div class="s-value bgreen" style="font-size:18px">${(()=>{const itens=f.filter(l=>l.marca==='Butano');const qtd=itens.reduce((a,b)=>a+b.qtd,0);const val=itens.reduce((a,b)=>a+b.total,0);return qtd>0?fmtVal(val/qtd):'—';})()}</div></div>`;

  const PROD_EMOJIS = {
    'Água 20L': '💧', 'Água 10L': '💧', 'Galão': '🪣',
    'P5': '🔴', 'P20': '🔴', 'P45': '🔴',
    'Cota P13': '📋', 'Cota P5': '📋', 'Cota P20': '📋', 'Cota P45': '📋',
    'Registro': '🔧', 'Kit': '📦'
  };
  const PROD_COLORS = {
    'agua':     { bg: '#eff6ff', border: '#bfdbfe', label: '#1d4ed8', value: '#1e40af' },
    'botijao':  { bg: '#fef3c7', border: '#fcd34d', label: '#92400e', value: '#b45309' },
    'cota':     { bg: '#f0fdf4', border: '#bbf7d0', label: '#15803d', value: '#166534' },
    'acessorio':{ bg: '#fdf4ff', border: '#e9d5ff', label: '#7e22ce', value: '#6b21a8' }
  };
  const prodItens = f.filter(l => l.marca === 'Produto');
  const cardProd  = document.getElementById('cardProdutosResumo');
  const gridProd  = document.getElementById('produtosResumoGrid');
  if (!prodItens.length) {
    cardProd.style.display = 'none';
  } else {
    cardProd.style.display = '';
    gridProd.innerHTML = PRODUTOS_AVULSOS.map(p => {
      const itensP = prodItens.filter(l => l.produto === p.label);
      if (!itensP.length) return '';
      const qtd = itensP.reduce((a, b) => a + b.qtd, 0);
      const val = itensP.reduce((a, b) => a + b.total, 0);
      const cor = PROD_COLORS[p.cat] || PROD_COLORS['acessorio'];
      const emoji = PROD_EMOJIS[p.label] || '📦';
      return `<div style="background:${cor.bg};border:1.5px solid ${cor.border};border-radius:12px;padding:12px 14px;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:${cor.label};margin-bottom:4px;">${emoji} ${p.label}</div>
        <div style="font-family:'Bebas Neue',sans-serif;font-size:26px;color:${cor.value};line-height:1.1;">${qtd}</div>
        <div style="font-size:11px;font-weight:600;color:${cor.label};margin-top:2px;">${fmtVal(val)}</div>
      </div>`;
    }).join('');
  }

  const _visitedPB=new Set();
  const _fPrimeiros=f.filter(l=>{const vid=l.vendaId!=null?l.vendaId:l.id;if(!_visitedPB.has(vid)){_visitedPB.add(vid);return true;}return false;});
  document.getElementById('payBreakdown').innerHTML=PAY_FIELDS.map(p=>{
    let val=_fPrimeiros.reduce((a,b)=>a+(b.pag&&b.pag[p]||0),0);
    let n=_fPrimeiros.filter(l=>l.pag&&l.pag[p]>0).length;
    const fpKey = Object.keys(FP_TO_PAY).find(k => FP_TO_PAY[k] === p);
    if (fpKey) {
      const extras = fiadoPagsFiltrados.filter(pg => pg.formasPag && pg.formasPag[fpKey] > 0);
      val += extras.reduce((a,pg)=>a+(pg.formasPag[fpKey]||0),0);
      n   += extras.length;
    }
    return`<div class="pay-item">
      <div class="pi-label">${PAY_EMOJIS[p]} ${p}</div>
      <div class="pi-val">${fmtVal(val)}</div>
      <div style="font-size:10px;color:var(--muted);margin-top:2px">${n} registros</div>
    </div>`;
  }).join('');

  const prsAtivos = [...new Set([...f.map(l=>l.pr), ...fiadoPagsFiltrados.map(p=>p.pr)])].sort();

  const grid=document.getElementById('prCardsGrid');
  if(!prsAtivos.length){
    grid.innerHTML='<div class="empty" style="grid-column:1/-1">Nenhum PR com dados para os filtros selecionados.</div>';
  } else {
    const fiadoPorPR = await calcFiadoPorPR();
    grid.innerHTML=prsAtivos.map(pr=>{
      const itens=f.filter(l=>l.pr===pr);
      const qtdUltra=itens.filter(l=>l.marca==='Ultragaz').reduce((a,b)=>a+b.qtd,0);
      const qtdButano=itens.filter(l=>l.marca==='Butano').reduce((a,b)=>a+b.qtd,0);
      const valUltra=itens.filter(l=>l.marca==='Ultragaz').reduce((a,b)=>a+b.total,0);
      const valButano=itens.filter(l=>l.marca==='Butano').reduce((a,b)=>a+b.total,0);
      const totalVenda=itens.reduce((a,b)=>a+b.total,0);
      const totalQtd=itens.reduce((a,b)=>a+b.qtd,0);

      const pagSoma={};
      const vistosPS=new Set();
      const itensPrimeiros=itens.filter(l=>{const vid=l.vendaId!=null?l.vendaId:l.id;if(!vistosPS.has(vid)){vistosPS.add(vid);return true;}return false;});
      PAY_FIELDS.forEach(p=>pagSoma[p]=itensPrimeiros.reduce((a,b)=>a+(b.pag&&b.pag[p]||0),0));
      fiadoPagsFiltrados.filter(pg=>pg.pr===pr).forEach(pg=>{
        Object.keys(FP_TO_PAY).forEach(fpKey=>{
          const v = (pg.formasPag && pg.formasPag[fpKey]) || 0;
          if (v > 0) { const label = FP_TO_PAY[fpKey]; pagSoma[label] = (pagSoma[label]||0) + v; }
        });
      });
      const pagRows=PAY_FIELDS.filter(p=>pagSoma[p]>0).map(p=>`
        <div class="pr-pag-row">
          <span class="pp-name">${PAY_EMOJIS[p]} ${p}${p==='Fiado'?' <span style="font-weight:400;font-size:10px;color:var(--muted)">(gerado no período)</span>':''}</span>
          <span class="pp-val ${p==='Fiado'?'fiado':''}">${fmtVal(pagSoma[p])}</span>
        </div>`).join('');

      const initials=pr.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();

      const saldoFiadoPR = (fiadoPorPR[pr] && fiadoPorPR[pr].saldo) || 0;
      const sobraAcum = -saldoFiadoPR;
      let sobraHtml = '';
      if (sobraAcum > 0.009) {
        sobraHtml = `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#dcfce7;border:1.5px solid #bbf7d0;border-radius:10px;">
          <span style="font-size:16px">💰</span>
          <div style="flex:1">
            <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#15803d">Crédito / Sobra</div>
            <div style="font-family:'Bebas Neue',sans-serif;font-size:20px;color:#15803d;line-height:1.1">${fmtVal(sobraAcum)}</div>
          </div>
        </div>`;
      } else if (sobraAcum < -0.009) {
        sobraHtml = `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#fef2f2;border:1.5px solid #fca5a5;border-radius:10px;">
          <span style="font-size:16px">⚠️</span>
          <div style="flex:1">
            <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#dc2626">Pendência (Saldo de Fiado)</div>
            <div style="font-family:'Bebas Neue',sans-serif;font-size:20px;color:#dc2626;line-height:1.1">${fmtVal(Math.abs(sobraAcum))}</div>
          </div>
        </div>`;
      }

      return`
        <div class="pr-card">
          <div class="pr-card-header">
            <div class="pr-avatar">${initials.slice(0,2)}</div>
            <div class="pr-header-info">
              <div class="pr-name">${pr}</div>
              <div class="pr-total-botijoes">${totalQtd} botijão(s) no período</div>
            </div>
            <div class="pr-total-valor-header">
              <span class="ptv-label">Total</span>
              <span class="ptv-val">${fmtVal(totalVenda)}</span>
            </div>
          </div>
          <div class="pr-card-body">
            <div class="pr-marcas">
              <div class="pr-marca-pill ultra">
                <div class="pm-top"><span class="pm-icon">🔵</span><span class="pm-label">Ultragaz</span></div>
                <div class="pm-bottom">
                  <span class="pm-qtd">${qtdUltra}</span>
                  <span class="pm-val-small">${fmtVal(valUltra)}</span>
                </div>
              </div>
              <div class="pr-marca-pill butano">
                <div class="pm-top"><span class="pm-icon">🟢</span><span class="pm-label">Butano</span></div>
                <div class="pm-bottom">
                  <span class="pm-qtd">${qtdButano}</span>
                  <span class="pm-val-small">${fmtVal(valButano)}</span>
                </div>
              </div>
            </div>
            ${sobraHtml}
            ${pagRows?`<div class="pr-pagamentos">
              <div class="pr-pag-title">💳 Formas de Pagamento</div>
              <div class="pr-pag-rows">${pagRows}</div>
            </div>`:'<div style="font-size:12px;color:var(--muted2);text-align:center;padding:8px 0">Sem dados de pagamento</div>'}
          </div>
        </div>`;
    }).join('');
  }

  const tb=document.getElementById('tbodyResumo');
  if(!f.length){tb.innerHTML='<tr><td colspan="14" class="empty">Nenhum dado.</td></tr>';
    destroyCharts(); renderRanking(f); return;}
  tb.innerHTML=[...f].sort((a,b)=>b.data.localeCompare(a.data)).map(l=>`
    <tr>
      <td>${fmtDate(l.data)}</td>
      <td style="font-weight:700">${l.pr}</td>
      <td style="font-family:'Bebas Neue',sans-serif;font-size:18px">${l.qtd}</td>
      <td>${fmtVal(l.preco)}</td>
      <td style="font-weight:700;color:var(--success)">${fmtVal(l.total)}</td>
      <td><span class="badge badge-${l.marca==='Ultragaz'?'ultra':'butano'}">${l.marca}</span></td>
      ${PAY_FIELDS.map(p=>`<td style="color:${p==='Fiado'?'var(--danger)':'var(--muted)'}">${l.pag&&l.pag[p]>0?fmtVal(l.pag[p]):'-'}</td>`).join('')}
      <td style="font-weight:700;color:var(--accent)">${fmtVal(sumPag(l.pag))}</td>
    </tr>`).join('');

  setTimeout(()=>{ renderCharts(f); renderRanking(f); }, 0);
}

function imprimirDetalhamento(){
  const tbody = document.getElementById('tbodyResumo');
  if (!tbody || tbody.querySelector('.empty')) { showToast('⚠️ Não há dados para imprimir.'); return; }

  const pr    = document.getElementById('rFiltPr').value;
  const marca = document.getElementById('rFiltMarca').value;
  const mes   = document.getElementById('rFiltMes').value;
  const dia   = document.getElementById('rFiltDia')?.value || '';

  const filtrosPartes = [];
  if (pr)    filtrosPartes.push(`PR: ${pr}`);
  if (marca) filtrosPartes.push(`Marca: ${marca}`);
  if (dia)   filtrosPartes.push(`Dia: ${fmtDate(dia)}`);
  else if (mes) filtrosPartes.push(`Mês: ${mes}`);
  const filtrosTxt = filtrosPartes.length ? filtrosPartes.join(' &nbsp;|&nbsp; ') : 'Todos os registros';

  const theadHTML = document.querySelector('#tab-resumo table thead').innerHTML;
  const tbodyHTML = tbody.innerHTML;
  const agora = new Date().toLocaleString('pt-BR');

  const win = window.open('', '_blank');
  win.document.write(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Detalhamento — Controle Roberto</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; margin: 24px; color:#111; }
        h1 { font-size: 18px; margin: 0 0 4px; }
        .sub { font-size: 12px; color:#555; margin-bottom: 4px; }
        .gerado { font-size: 10px; color:#999; margin-bottom: 16px; }
        table { width:100%; border-collapse: collapse; font-size: 10px; }
        th, td { border: 1px solid #ccc; padding: 5px 6px; text-align: left; white-space: nowrap; }
        th { background:#f2f2f2; text-transform:uppercase; font-size:9px; }
        tr:nth-child(even) { background:#fafafa; }
        @media print { @page { size: A4 landscape; margin: 12mm; } }
      </style>
    </head>
    <body>
      <h1>📋 Controle Roberto — Detalhamento</h1>
      <div class="sub">${filtrosTxt}</div>
      <div class="gerado">Gerado em ${agora}</div>
      <table>
        <thead>${theadHTML}</thead>
        <tbody>${tbodyHTML}</tbody>
      </table>
      <script>
        window.onload = function(){ window.print(); };
      <\/script>
    </body>
    </html>
  `);
  win.document.close();
}

// ── CONFIG ──
function buildConfigGrid(){
  document.getElementById('configGrid').innerHTML=PRS.map(pr=>{
    const cfg=configPrecos[pr]||{};
    const safeid=pr.replace(/[^a-zA-Z0-9]/g,'_');
    return`<div class="config-item" id="cfgcard_${safeid}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <div class="pr-name-cfg">👤 ${pr}</div>
        <button class="btn-sm-del" title="Excluir PR" onclick="excluirPR('${pr.replace(/'/g,"\\'")}')">🗑️</button>
      </div>
      <div class="config-prices">
        <div class="price-field"><label>🔵 Ultragaz (R$)</label><input type="number" id="cfg_${safeid}_ultra" min="0" step="0.01" value="${cfg.ultragaz||''}" placeholder="0,00" /></div>
        <div class="price-field"><label>🟢 Butano (R$)</label><input type="number" id="cfg_${safeid}_butano" min="0" step="0.01" value="${cfg.butano||''}" placeholder="0,00" /></div>
      </div>
    </div>`;
  }).join('');
}
async function saveConfig(){
  PRS.forEach(pr=>{
    const safeid=pr.replace(/[^a-zA-Z0-9]/g,'_');
    const uEl=document.getElementById(`cfg_${safeid}_ultra`);
    const bEl=document.getElementById(`cfg_${safeid}_butano`);
    configPrecos[pr]={
      ultragaz:uEl?parseFloat(uEl.value)||0:0,
      butano:  bEl?parseFloat(bEl.value)||0:0
    };
  });
  window._configPrecos = configPrecos;
  try {
    await window._fbSetDoc('config', 'precos', configPrecos);
  } catch(e) { console.error('Erro ao salvar config:', e); }
  const m=document.getElementById('configMsg');
  m.textContent='✓ Configurações salvas!';
  setTimeout(()=>m.textContent='',3000);
  showToast('✓ Configurações salvas!');
}
async function excluirPR(pr){
  const temLanc=lancamentos.some(l=>l.pr===pr);
  const aviso=temLanc?`\n⚠️ Atenção: existe(m) lançamento(s) registrado(s) para este PR.\nEles NÃO serão excluídos, mas o PR não aparecerá mais para novos lançamentos.`:'';
  if(!confirm(`Deseja excluir o PR "${pr}"?${aviso}`)) return;
  const idx=PRS.indexOf(pr);
  if(idx===-1) return;
  PRS.splice(idx,1);
  delete configPrecos[pr];
  try { await window._fbSetDoc('config', 'precos', configPrecos); } catch(e) {}
  try { await window._savePRs([...PRS]); } catch(e) { console.error('Erro ao salvar PRs:', e); }
  ['fPr','rFiltPr','editPr'].forEach(id=>{
    const sel=document.getElementById(id);
    const cur=sel.value;
    sel.innerHTML='';
    if(id==='fPr'){const ph=document.createElement('option');ph.value='';ph.textContent='— Selecione o PR —';sel.appendChild(ph);}
    else if(id==='rFiltPr'){const ph=document.createElement('option');ph.value='';ph.textContent='Todos os PRs';sel.appendChild(ph);}
    PRS.forEach(p=>{const o=document.createElement('option');o.value=p;o.textContent=p;sel.appendChild(o);});
    if(cur!==pr) sel.value=cur;
  });
  buildConfigGrid();
  showToast(`🗑️ PR "${pr}" excluído!`);
}

// ── TOAST ──
function showToast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2500);
}

// ── EDIÇÃO ──
const EDIT_PAY_IDS=['ePEspecie','ePDebito','ePCredito','ePQrCode','ePPix','ePMoeda','ePFiado','ePGasPovo','ePSobrasAnt'];

function abrirEdicao(id){
  const l=lancamentos.find(x=>x.id===id);
  if(!l) return;
  document.getElementById('editId').value=id;
  document.getElementById('editData').value=l.data;
  document.getElementById('editQtd').value=l.qtd;
  document.getElementById('editPreco').value=l.preco;
  document.getElementById('editTotal').value=l.total>0?'R$ '+fmtNum(l.total):'';
  selectEditBrand(l.marca);
  const sel=document.getElementById('editPr');
  if(!sel.options.length){
    PRS.forEach(pr=>{const o=document.createElement('option');o.value=pr;o.textContent=pr;sel.appendChild(o);});
  }
  sel.value=l.pr;
  EDIT_PAY_IDS.forEach((eid,idx)=>{
    document.getElementById(eid).value=(l.pag&&l.pag[PAY_FIELDS[idx]])||'';
  });
  document.getElementById('editErr').textContent='';
  document.getElementById('editModal').classList.add('open');
}
function fecharModal(){
  document.getElementById('editModal').classList.remove('open');
}
function selectEditBrand(brand){
  document.getElementById('editBtnUltra').classList.toggle('active',brand==='Ultragaz');
  document.getElementById('editBtnButano').classList.toggle('active',brand==='Butano');
  calcEditTotal();
}
function calcEditTotal(){
  const qtd=parseFloat(document.getElementById('editQtd').value)||0;
  const p=parseFloat(document.getElementById('editPreco').value)||0;
  const t=qtd*p;
  document.getElementById('editTotal').value=t>0?'R$ '+fmtNum(t):'';
}
function getEditBrand(){
  if(document.getElementById('editBtnUltra').classList.contains('active')) return 'Ultragaz';
  if(document.getElementById('editBtnButano').classList.contains('active')) return 'Butano';
  return '';
}
async function salvarEdicao(){
  const id=parseInt(document.getElementById('editId').value);
  const data=document.getElementById('editData').value;
  const pr=document.getElementById('editPr').value;
  const qtd=parseFloat(document.getElementById('editQtd').value)||0;
  const preco=parseFloat(document.getElementById('editPreco').value)||0;
  const marca=getEditBrand();
  const err=document.getElementById('editErr');
  if(!data){err.textContent='⚠ Informe a data.';return;}
  if(!pr){err.textContent='⚠ Selecione o PR.';return;}
  if(!qtd||!preco||!marca){err.textContent='⚠ Preencha qtd, preço e marca.';return;}
  err.textContent='';
  const pag={};
  EDIT_PAY_IDS.forEach((eid,idx)=>pag[PAY_FIELDS[idx]]=parseFloat(document.getElementById(eid).value)||0);
  const idx=lancamentos.findIndex(x=>x.id===id);
  if(idx===-1) return;
  lancamentos[idx]={...lancamentos[idx],data,pr,qtd,preco,total:qtd*preco,marca,pag};
  await save({type:'add', items:[lancamentos[idx]]}); renderTable(); renderTotals();
  fecharModal();
  showToast('✓ Lançamento atualizado!');
}

// ── EDIÇÃO EM GRUPO ──
let _egLinhasCount=0;
const EG_PAY_IDS=['egEspecie','egDebito','egCredito','egQrCode','egPix','egMoeda','egFiado','egGasPovo','egSobrasAnt'];

function abrirEdicaoGrupoComDados(data, pr){
  const itens=lancamentos.filter(l=>l.data===data&&l.pr===pr);
  if(!itens.length) return;

  document.getElementById('egData').value=data;
  const egSel=document.getElementById('egPr');
  egSel.innerHTML='';
  PRS.forEach(p=>{const o=document.createElement('option');o.value=p;o.textContent=p;egSel.appendChild(o);});
  egSel.value=pr;

  _egLinhasCount=0;
  const cont=document.getElementById('egLinhasContainer');
  cont.innerHTML='';
  itens.forEach(l=>{ _egAdicionarLinhaComDados(l.id, l.qtd, l.preco, l.marca); });

  const vistos=new Set();
  let pagRef={}, valeGasRefEg=0, fiadoClienteRefEg='';
  itens.forEach(l=>{
    const vid=l.vendaId!=null?l.vendaId:l.id;
    if(!vistos.has(vid)){vistos.add(vid);pagRef=l.pag||{};valeGasRefEg=l.valeGas||0;fiadoClienteRefEg=l.fiadoCliente||'';}
  });
  EG_PAY_IDS.forEach((eid,idx)=>{
    const val=pagRef[PAY_FIELDS[idx]];
    document.getElementById(eid).value=(val&&val>0)?val:'';
  });
  document.getElementById('egValeGas').value = valeGasRefEg>0 ? valeGasRefEg : '';
  const egSelCliente = document.getElementById('egFiadoCliente');
  egSelCliente.innerHTML = '<option value="">— Não, manter no nome do PR —</option>' + CLIENTES.map(c=>`<option value="${c}">${c}</option>`).join('');
  egSelCliente.value = fiadoClienteRefEg;
  egCalcPagTotal();

  document.getElementById('egErr').textContent='';
  document.getElementById('editGrupoSubtitulo').textContent=`${fmtDate(data)} — ${pr} — ${itens.length} linha(s)`;
  document.getElementById('editGrupoModal').style.display='flex';
}

function _egAdicionarLinhaComDados(origId, qtd, preco, marca){
  const i=_egLinhasCount++;
  const d=document.createElement('div');
  d.id='eg_linha_'+i;
  d.dataset.origId=origId||'';
  d.dataset.marca=marca||'Ultragaz';
  d.style.cssText='display:grid;grid-template-columns:80px 120px 110px 1fr 32px;gap:6px;align-items:center;margin-bottom:8px;padding:9px 10px;background:var(--surface2);border:1.5px solid var(--border);border-radius:10px;';
  const isUltra=(marca==='Ultragaz');
  d.innerHTML=`
    <input type="number" id="eg_qtd_${i}" min="0" placeholder="0" value="${qtd||''}" oninput="egCalcLinhaTotal(${i})" style="background:#fff;border:1.5px solid var(--border);color:var(--text);padding:7px 9px;border-radius:7px;font-family:'DM Sans',sans-serif;font-size:14px;width:100%;" />
    <input type="number" id="eg_preco_${i}" min="0" step="0.01" placeholder="0,00" value="${preco||''}" oninput="egCalcLinhaTotal(${i})" style="background:#fff;border:1.5px solid var(--border);color:var(--text);padding:7px 9px;border-radius:7px;font-family:'DM Sans',sans-serif;font-size:14px;width:100%;" />
    <input type="text" id="eg_total_${i}" readonly placeholder="R$ 0,00" style="background:var(--surface3);border:1.5px solid var(--border);color:var(--success);font-weight:700;padding:7px 9px;border-radius:7px;font-family:'DM Sans',sans-serif;font-size:13px;width:100%;" />
    <div style="display:flex;gap:4px;">
      <button id="eg_ultra_${i}" onclick="egSelectBrand(${i},'Ultragaz')" class="eg-brand-btn${isUltra?' eg-ultra-active':''}" style="flex:1;padding:7px 4px;border-radius:7px;font-family:'DM Sans',sans-serif;font-size:11px;font-weight:700;cursor:pointer;border:2px solid ${isUltra?'#1d4ed8':'var(--border)'};background:${isUltra?'#eff6ff':'#fff'};color:${isUltra?'#1d4ed8':'var(--muted)'};">🔵 Ultra</button>
      <button id="eg_butano_${i}" onclick="egSelectBrand(${i},'Butano')" class="eg-brand-btn${!isUltra?' eg-butano-active':''}" style="flex:1;padding:7px 4px;border-radius:7px;font-family:'DM Sans',sans-serif;font-size:11px;font-weight:700;cursor:pointer;border:2px solid ${!isUltra?'#15803d':'var(--border)'};background:${!isUltra?'#f0fdf4':'#fff'};color:${!isUltra?'#15803d':'var(--muted)'};">🟢 But</button>
    </div>
    <button onclick="egRemoverLinha(${i})" style="background:#fef2f2;color:#dc2626;border:1.5px solid #fca5a5;border-radius:7px;width:30px;height:30px;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">✕</button>`;
  document.getElementById('egLinhasContainer').appendChild(d);
  egCalcLinhaTotal(i);
}

function egAdicionarLinha(){
  _egAdicionarLinhaComDados(null,'','','Ultragaz');
}

function egRemoverLinha(i){
  const total=document.querySelectorAll('#egLinhasContainer > div').length;
  if(total<=1){showToast('⚠ Mínimo de 1 linha!');return;}
  const el=document.getElementById('eg_linha_'+i);
  if(el) el.remove();
}

function egSelectBrand(i, marca){
  const ub=document.getElementById('eg_ultra_'+i);
  const bb=document.getElementById('eg_butano_'+i);
  const linha=document.getElementById('eg_linha_'+i);
  if(!ub||!bb||!linha) return;
  linha.dataset.marca=marca;
  if(marca==='Ultragaz'){
    ub.style.cssText='flex:1;padding:7px 4px;border-radius:7px;font-family:DM Sans,sans-serif;font-size:11px;font-weight:700;cursor:pointer;border:2px solid #1d4ed8;background:#eff6ff;color:#1d4ed8;';
    bb.style.cssText='flex:1;padding:7px 4px;border-radius:7px;font-family:DM Sans,sans-serif;font-size:11px;font-weight:700;cursor:pointer;border:2px solid #dde1ec;background:#fff;color:#6b7280;';
  } else {
    bb.style.cssText='flex:1;padding:7px 4px;border-radius:7px;font-family:DM Sans,sans-serif;font-size:11px;font-weight:700;cursor:pointer;border:2px solid #15803d;background:#f0fdf4;color:#15803d;';
    ub.style.cssText='flex:1;padding:7px 4px;border-radius:7px;font-family:DM Sans,sans-serif;font-size:11px;font-weight:700;cursor:pointer;border:2px solid #dde1ec;background:#fff;color:#6b7280;';
  }
}

function egGetBrand(i){
  const linha=document.getElementById('eg_linha_'+i);
  return linha?linha.dataset.marca||'Ultragaz':'Ultragaz';
}

function egCalcLinhaTotal(i){
  const q=parseFloat(document.getElementById('eg_qtd_'+i)?.value)||0;
  const p=parseFloat(document.getElementById('eg_preco_'+i)?.value)||0;
  const t=q*p;
  const el=document.getElementById('eg_total_'+i);
  if(el) el.value=t>0?'R$ '+fmtNum(t):'';
}

function egCalcPagTotal(){
  let t=0; EG_PAY_IDS.forEach(id=>t+=parseFloat(document.getElementById(id)?.value)||0);
  document.getElementById('egPagTotal').textContent='R$ '+fmtNum(t);
}

function fecharEditGrupoModal(){
  document.getElementById('editGrupoModal').style.display='none';
}

async function salvarEdicaoGrupo(){
  const data=document.getElementById('egData').value;
  const pr=document.getElementById('egPr').value;
  const err=document.getElementById('egErr');
  if(!data){err.textContent='⚠ Informe a data.';return;}
  if(!pr){err.textContent='⚠ Selecione o PR.';return;}
  err.textContent='';

  const linhaEls=document.querySelectorAll('#egLinhasContainer > div');
  const novasLinhas=[];
  for(const el of linhaEls){
    const i=el.id.replace('eg_linha_','');
    const qtd=parseFloat(document.getElementById('eg_qtd_'+i)?.value)||0;
    const preco=parseFloat(document.getElementById('eg_preco_'+i)?.value)||0;
    const marca=egGetBrand(i);
    if(qtd>0&&marca){
      novasLinhas.push({origId:el.dataset.origId?parseInt(el.dataset.origId):null,qtd,preco,total:qtd*preco,marca});
    }
  }
  if(!novasLinhas.length){err.textContent='⚠ Preencha ao menos 1 linha válida.';return;}

  const pag={};
  EG_PAY_IDS.forEach((eid,idx)=>pag[PAY_FIELDS[idx]]=parseFloat(document.getElementById(eid)?.value)||0);
  const valeGasEg = parseInt(document.getElementById('egValeGas')?.value, 10) || 0;
  const fiadoClienteEg = (pag['Fiado'] > 0.009) ? (document.getElementById('egFiadoCliente')?.value || '') : '';

  const sobrasAntUsadasEg = pag['Sobras Anteriores'] || 0;
  if (sobrasAntUsadasEg > 0.009) {
    const oldItensEg = lancamentos.filter(l => l.data === _grupoAtualData && l.pr === _grupoAtualPr);
    const excludeVidEg = oldItensEg.length ? (oldItensEg[0].vendaId != null ? oldItensEg[0].vendaId : oldItensEg[0].id) : null;
    const sobraDisponivelEg = await getSobraDisponivelPR(pr, excludeVidEg);
    if (sobrasAntUsadasEg > sobraDisponivelEg + 0.009) {
      err.textContent = sobraDisponivelEg > 0
        ? `⚠ Não há sobra suficiente para ${pr}. Disponível: R$ ${fmtNum(sobraDisponivelEg)}.`
        : `⚠ Não há sobra registrada para ${pr}.`;
      return;
    }
  }

  const oldItens=lancamentos.filter(l=>l.data===_grupoAtualData&&l.pr===_grupoAtualPr);
  const vendaIdBase=oldItens.length?oldItens[0].vendaId||oldItens[0].id:Date.now();
  lancamentos=lancamentos.filter(l=>!(l.data===_grupoAtualData&&l.pr===_grupoAtualPr));

  const now=Date.now();
  const novosItensEg=[];
  novasLinhas.forEach((l,idx)=>{
    const id=l.origId&&idx<oldItens.length?oldItens[idx].id:(now+idx);
    const item={
      id, vendaId:vendaIdBase, data, pr, qtd:l.qtd, preco:l.preco, total:l.total, marca:l.marca,
      pag: idx===0 ? pag : Object.fromEntries(PAY_FIELDS.map(f=>[f,0])),
      valeGas: idx===0 ? valeGasEg : 0,
      fiadoCliente: idx===0 ? fiadoClienteEg : ''
    };
    lancamentos.push(item);
    novosItensEg.push(item);
  });

  const idsOrfaosEg=oldItens.slice(novasLinhas.length).map(l=>l.id);
  _grupoAtualData=data; _grupoAtualPr=pr;
  await save({type:'add', items:novosItensEg});
  if (idsOrfaosEg.length) await window._deleteLancamentosIds(idsOrfaosEg);
  renderTable(); renderTotals();
  fecharEditGrupoModal();
  showToast('✓ Venda atualizada com sucesso!');
}
// ══════════════════════════════════════════════════════════
//  DEPÓSITO BANCÁRIO
// ══════════════════════════════════════════════════════════
let _depositosCache = null;

async function _loadDepositos() {
  if (_depositosCache) return _depositosCache;
  try {
    _depositosCache = await window._fbGetCollection('depositos');
  } catch(e) {
    console.warn('[depositos] erro ao carregar:', e.message);
    _depositosCache = [];
  }
  return _depositosCache;
}

async function _saveDepositos() {
  await window._fbSaveCollection('depositos', _depositosCache, d => d.id || d._fbId);
}

async function renderDeposito() {
  const dataEl = document.getElementById('depData');
  if (dataEl && !dataEl.value) dataEl.value = hojeLocal();
  const dia = dataEl ? dataEl.value : hojeLocal();

  const fonte = (window._lancamentos && window._lancamentos.length) ? window._lancamentos : lancamentos;
  const doDia = fonte.filter(l => l.data === dia);
  const vistos = new Set();
  let totalEspecie = 0;
  doDia.forEach(l => {
    const vid = l.vendaId != null ? l.vendaId : l.id;
    if (!vistos.has(vid)) { vistos.add(vid); totalEspecie += (l.pag && l.pag['Espécie']) || 0; }
  });

  try {
    const _todosFiadoPags = await _loadFiadoPag();
    const especieFiadoDoDia = _todosFiadoPags
      .filter(p => p.tipo !== 'sobra' && p.tipo !== 'falta_fiado' && p.formasPag && p.data === dia)
      .reduce((a,p) => a + (p.formasPag.especie || 0), 0);
    totalEspecie += especieFiadoDoDia;
  } catch(e) { console.warn('[deposito] erro ao somar espécie de fiados quitados:', e.message); }

  const lancamentosDep = await _loadDepositos();
  const dep_dia = lancamentosDep.filter(d => d.data === dia).sort((a,b) => (a.criadoEm||0) - (b.criadoEm||0));
  const totalDescontos = dep_dia.filter(d => d.tipo !== 'acrescimo').reduce((a,d) => a + (d.valor || 0), 0);
  const totalAcrescimos = dep_dia.filter(d => d.tipo === 'acrescimo').reduce((a,d) => a + (d.valor || 0), 0);
  const totalBanco = totalEspecie + totalAcrescimos - totalDescontos;

  document.getElementById('depTotalEspecie').textContent = fmtVal(totalEspecie);
  document.getElementById('depTotalAcrescimos').textContent = fmtVal(totalAcrescimos);
  document.getElementById('depTotalDescontos').textContent = fmtVal(totalDescontos);
  document.getElementById('depTotalBanco').textContent = fmtVal(totalBanco);

  const tb = document.getElementById('tbodyDepositoDescontos');
  if (!dep_dia.length) {
    tb.innerHTML = '<tr><td colspan="4" class="empty">Nenhum lançamento neste dia.</td></tr>';
  } else {
    tb.innerHTML = dep_dia.map(d => {
      const isAcresc = d.tipo === 'acrescimo';
      return `<tr>
        <td>${isAcresc ? '<span style="color:var(--success);font-weight:700;">➕ Acréscimo</span>' : '<span style="color:var(--danger);font-weight:700;">➖ Desconto</span>'}</td>
        <td style="color:${isAcresc?'var(--success)':'var(--danger)'};font-weight:700;">${isAcresc?'+':'-'} ${fmtVal(d.valor)}</td>
        <td>${d.obs || '-'}</td>
        <td><button class="btn-sm-del" onclick="excluirDesconto('${d.id}')">🗑️</button></td>
      </tr>`;
    }).join('');
  }

  const histMesEl = document.getElementById('depHistFiltroMes');
  const histMes = histMesEl ? histMesEl.value : '';
  let historicoCompleto = [...lancamentosDep];
  if (histMes) historicoCompleto = historicoCompleto.filter(d => d.data && d.data.startsWith(histMes));
  historicoCompleto.sort((a,b) => b.data.localeCompare(a.data) || (b.criadoEm||0) - (a.criadoEm||0));

  const histTotalAcrescimos = historicoCompleto.filter(d => d.tipo === 'acrescimo').reduce((a,d) => a + (d.valor || 0), 0);
  const histTotalDescontos  = historicoCompleto.filter(d => d.tipo !== 'acrescimo').reduce((a,d) => a + (d.valor || 0), 0);
  const histSaldo = histTotalAcrescimos - histTotalDescontos;

  const elHistAcr = document.getElementById('depHistTotalAcrescimos');
  const elHistDesc = document.getElementById('depHistTotalDescontos');
  const elHistSaldo = document.getElementById('depHistTotalSaldo');
  if (elHistAcr) elHistAcr.textContent = fmtVal(histTotalAcrescimos);
  if (elHistDesc) elHistDesc.textContent = fmtVal(histTotalDescontos);
  if (elHistSaldo) {
    elHistSaldo.textContent = (histSaldo < 0 ? '- ' : '') + fmtVal(Math.abs(histSaldo));
    elHistSaldo.style.color = histSaldo < 0 ? 'var(--danger)' : 'var(--success)';
  }

  const tbHist = document.getElementById('tbodyDepositoHistorico');
  if (tbHist) {
    if (!historicoCompleto.length) {
      tbHist.innerHTML = '<tr><td colspan="5" class="empty">Nenhum lançamento registrado ainda.</td></tr>';
    } else {
      tbHist.innerHTML = historicoCompleto.map(d => {
        const isAcresc = d.tipo === 'acrescimo';
        return `<tr>
          <td style="color:var(--muted);font-size:12px;white-space:nowrap;">${fmtDate(d.data)}</td>
          <td>${isAcresc ? '<span style="color:var(--success);font-weight:700;">➕ Acréscimo</span>' : '<span style="color:var(--danger);font-weight:700;">➖ Desconto</span>'}</td>
          <td style="color:${isAcresc?'var(--success)':'var(--danger)'};font-weight:700;">${isAcresc?'+':'-'} ${fmtVal(d.valor)}</td>
          <td>${d.obs || '-'}</td>
          <td><button class="btn-sm-del" onclick="excluirDesconto('${d.id}')">🗑️</button></td>
        </tr>`;
      }).join('');
    }
  }
}

async function adicionarDesconto() {
  const dia = document.getElementById('depData').value || hojeLocal();
  const tipoEl = document.getElementById('depTipo');
  const valorEl = document.getElementById('depDescValor');
  const obsEl = document.getElementById('depDescObs');
  const err = document.getElementById('depDescErr');
  const tipo = tipoEl ? tipoEl.value : 'desconto';
  const valor = parseFloat(valorEl.value) || 0;
  if (valor <= 0) { err.textContent = '⚠ Informe um valor válido.'; return; }
  err.textContent = '';

  const descontos = await _loadDepositos();
  descontos.push({ id: 'dep_' + Date.now(), data: dia, tipo, valor, obs: (obsEl.value || '').trim(), criadoEm: Date.now() });
  await _saveDepositos();

  valorEl.value = '';
  obsEl.value = '';
  showToast(tipo === 'acrescimo' ? '✓ Acréscimo lançado!' : '✓ Desconto lançado!');
  renderDeposito();
}

async function excluirDesconto(id) {
  if (!confirm('Remover este desconto?')) return;
  const descontos = await _loadDepositos();
  _depositosCache = descontos.filter(d => d.id !== id);
  await window._fbDeleteDoc('depositos', id);
  showToast('✓ Desconto removido!');
  renderDeposito();
}

// ── ADICIONAR NOVO PR ──
async function adicionarNovoPR(){
  const input=document.getElementById('newPrInput');
  const nome=input.value.trim().toUpperCase();
  const msg=document.getElementById('newPrMsg');
  if(!nome){msg.style.color='var(--danger)';msg.textContent='⚠ Informe o nome do PR.';return;}
  if(PRS.includes(nome)){msg.style.color='var(--danger)';msg.textContent='⚠ PR já existe na lista.';return;}
  PRS.push(nome);
  PRS.sort();
  try { await window._savePRs([...PRS]); } catch(e) { console.error('Erro ao salvar PRs:', e); }
  ['fPr','rFiltPr'].forEach(id=>{
    const sel=document.getElementById(id);
    const cur=sel.value;
    sel.innerHTML='';
    const ph=document.createElement('option');
    ph.value='';ph.textContent=id==='fPr'?'— Selecione o PR —':'Todos os PRs';
    sel.appendChild(ph);
    PRS.forEach(pr=>{const o=document.createElement('option');o.value=pr;o.textContent=pr;sel.appendChild(o);});
    sel.value=cur;
  });
  const editSel=document.getElementById('editPr');
  editSel.innerHTML='';
  PRS.forEach(pr=>{const o=document.createElement('option');o.value=pr;o.textContent=pr;editSel.appendChild(o);});
  buildConfigGrid();
  input.value='';
  msg.style.color='var(--success)';
  msg.textContent=`✓ "${nome}" adicionado com sucesso!`;
  setTimeout(()=>msg.textContent='',3500);
  showToast(`✓ PR "${nome}" adicionado!`);
}

// ══════════════════════════════════════════════════════════
//  CONTROLE DE CARGAS
// ══════════════════════════════════════════════════════════

const EMPRESAS_VENC = [
  { nome: 'BERTONI',  diasPadrao: 5 },
  { nome: 'ROSA',     diasPadrao: 5 },
  { nome: 'PINHEIRO', diasPadrao: 6 },
  { nome: 'LIROMILS', diasPadrao: 5 },
];

const PRODUTOS_FRETE = ['P 05','P 13','P 20','P 45'];
const PRODUTOS_CARGA_OPTS = ['P 05','P 13','P 20','P 45'];

let numItensCarga = 1;

function _buildItemCargaDOM(containerId, i, qtd, prod, marca) {
  const c = document.getElementById(containerId);
  const d = document.createElement('div');
  d.className = 'carga-item-row'; d.id = containerId + '_item_' + i;
  const isP13 = prod === 'P 13';
  const marcaDefault = marca || _tipoCargaAtual(containerId);
  d.innerHTML = `
    <input type="number" id="${containerId}_qtd_${i}" min="0" placeholder="0" value="${qtd||''}" oninput="calcFreteAuto()" />
    <select id="${containerId}_prod_${i}" onchange="calcFreteAuto();_toggleMarcaCarga('${containerId}',${i})">
      <option value="">— Produto —</option>
      ${PRODUTOS_CARGA_OPTS.map(p=>`<option value="${p}"${prod===p?' selected':''}>${p}</option>`).join('')}
    </select>
    <select id="${containerId}_marca_${i}" style="display:${isP13?'':'none'}">
      <option value="Ultragaz"${marcaDefault!=='Butano'?' selected':''}>🔵 Ultragaz</option>
      <option value="Butano"${marcaDefault==='Butano'?' selected':''}>🟢 Butano</option>
    </select>
    <button class="btn-rm-linha" onclick="removeItemCarga('${containerId}',${i})" title="Remover">✕</button>`;
  c.appendChild(d);
}

function _toggleMarcaCarga(containerId, i) {
  const prodEl  = document.getElementById(`${containerId}_prod_${i}`);
  const marcaEl = document.getElementById(`${containerId}_marca_${i}`);
  if (marcaEl) marcaEl.style.display = (prodEl && prodEl.value === 'P 13') ? '' : 'none';
}

function _tipoCargaAtual(containerId) {
  const id = containerId === 'ecItensContainer' ? 'ecTipo' : 'cTipo';
  const el = document.getElementById(id);
  return (el && el.value) || 'Ultragaz';
}

function _aplicarTipoCargaAosItens(containerId) {
  containerId = containerId || 'cItensContainer';
  const tipo = _tipoCargaAtual(containerId);
  document.querySelectorAll(`#${containerId} .carga-item-row`).forEach(row => {
    const marcaEl = row.querySelector('select[id*="_marca_"]');
    if (marcaEl) marcaEl.value = tipo;
  });
}

function buildItensCarga(containerId, itens) {
  const c = document.getElementById(containerId);
  c.innerHTML = '';
  const lista = itens && itens.length ? itens : [{}];
  if (containerId === 'cItensContainer') numItensCarga = 0;
  lista.forEach((item, i) => {
    _buildItemCargaDOM(containerId, i, item.qtd, item.produto, item.marca);
    if (containerId === 'cItensContainer') numItensCarga++;
  });
}

function addItemCarga() {
  _buildItemCargaDOM('cItensContainer', numItensCarga, '', '', '');
  numItensCarga++;
}

function removeItemCarga(containerId, i) {
  const isNew = containerId === 'cItensContainer';
  const totalAtual = isNew ? numItensCarga : document.querySelectorAll(`#${containerId} .carga-item-row`).length;
  if (totalAtual <= 1) { showToast('Deve haver ao menos 1 item.'); return; }
  const total = isNew ? numItensCarga : totalAtual;
  const dados = [];
  for (let j = 0; j < total; j++) {
    if (j === i) continue;
    const qEl = document.getElementById(`${containerId}_qtd_${j}`);
    const pEl = document.getElementById(`${containerId}_prod_${j}`);
    const mEl = document.getElementById(`${containerId}_marca_${j}`);
    if (qEl && pEl) dados.push({ qtd: qEl.value, produto: pEl.value, marca: mEl ? mEl.value : '' });
  }
  buildItensCarga(containerId, dados.map(d => ({ qtd: parseFloat(d.qtd)||0, produto: d.produto, marca: d.marca })));
  if (isNew) numItensCarga = dados.length;
  calcFreteAuto();
}

function addItemEditCarga() {
  const total = document.querySelectorAll('#ecItensContainer .carga-item-row').length;
  _buildItemCargaDOM('ecItensContainer', total, '', '', '');
}

function getItensCarga(containerId) {
  const itens = [];
  let i = 0;
  while (document.getElementById(`${containerId}_qtd_${i}`) !== null) {
    const qtd = parseFloat(document.getElementById(`${containerId}_qtd_${i}`).value) || 0;
    const produto = document.getElementById(`${containerId}_prod_${i}`).value || '';
    const marcaEl = document.getElementById(`${containerId}_marca_${i}`);
    const marca = (produto === 'P 13' && marcaEl) ? marcaEl.value : '';
    if (qtd > 0 || produto) itens.push({ qtd, produto, marca });
    i++;
  }
  return itens;
}

// ══════════════════════════════════════════════════════════
//  CONTROLE DE ESTOQUE — P13
// ══════════════════════════════════════════════════════════
const LS_ESTOQUE_INICIAL_KEY = 'estoqueInicial_v1';
const LS_ESTOQUE_LOCAL_KEY = 'estoqueLocalAtual_v1';
let estoqueOutroAtual = null;

function getEstoqueLocalAtual() {
  try {
    return localStorage.getItem(LS_ESTOQUE_LOCAL_KEY) || 'Franco da Rocha';
  } catch (e) { return 'Franco da Rocha'; }
}

function trocarLocalEstoque(local) {
  try { localStorage.setItem(LS_ESTOQUE_LOCAL_KEY, local); } catch (e) {}
  atualizarBotoesLocalEstoque();
  renderEstoque();
  if (estoqueOutroAtual) renderEstoqueOutro();
}

function atualizarBotoesLocalEstoque() {
  const local = getEstoqueLocalAtual();
  const btnF = document.getElementById('btnLocalFranco');
  const btnM = document.getElementById('btnLocalMorato');
  if (btnF) btnF.classList.toggle('active', local === 'Franco da Rocha');
  if (btnM) btnM.classList.toggle('active', local === 'Morato');
}

function _cargaPertenceAoLocal(c, local) {
  return (c.descarga || 'Franco da Rocha') === local;
}

function getEstoqueInicialCacheLocal() {
  try {
    return JSON.parse(localStorage.getItem(LS_ESTOQUE_INICIAL_KEY) || '{}');
  } catch (e) { return {}; }
}

function getEstoqueInicial() {
  if (window._estoqueInicialCache) return window._estoqueInicialCache;
  return getEstoqueInicialCacheLocal();
}

async function carregarEstoqueInicialSupabase() {
  try {
    const cfg = await window._fbGetDoc('config', 'estoque_inicial');
    window._estoqueInicialCache = cfg || getEstoqueInicialCacheLocal();
  } catch (e) {
    console.warn('[Estoque] Não foi possível carregar estoque inicial do Supabase, usando cache local:', e);
    window._estoqueInicialCache = getEstoqueInicialCacheLocal();
  }
}

async function salvarEstoqueInicial() {
  const cfg = {
    ultragaz: parseFloat(document.getElementById('eEstInicialUltra').value) || 0,
    butano:   parseFloat(document.getElementById('eEstInicialButano').value) || 0,
    data:     document.getElementById('eEstInicialData').value || ''
  };
  window._estoqueInicialCache = cfg;
  try {
    localStorage.setItem(LS_ESTOQUE_INICIAL_KEY, JSON.stringify(cfg));
  } catch (e) {}
  try {
    await window._fbSetDoc('config', 'estoque_inicial', cfg);
    showToast('💾 Estoque inicial salvo!');
  } catch (e) {
    console.error('[Estoque] Erro ao salvar estoque inicial no Supabase:', e);
    showToast('⚠ Salvo localmente, mas houve erro ao salvar no Supabase.');
  }
  renderEstoque();
}

function buildEstoqueMesOptions() {
  const sel = document.getElementById('eFiltMes');
  if (!sel) return;
  const mesesSet = new Set([
    ...lancamentos.filter(l => l.marca === 'Ultragaz' || l.marca === 'Butano').map(l => l.data.slice(0, 7)),
    ...cargas.map(c => c.data ? c.data.slice(0, 7) : '').filter(Boolean)
  ]);
  const sorted = [...mesesSet].sort().reverse();
  const cur = sel.value;
  sel.innerHTML = '<option value="">Todos os meses</option>';
  sorted.forEach(m => {
    const [y, mo] = m.split('-');
    const o = document.createElement('option');
    o.value = m; o.textContent = `${MESES_PT[parseInt(mo, 10) - 1]} ${y}`;
    if (m === cur) o.selected = true;
    sel.appendChild(o);
  });
}

function calcEstoqueDiario() {
  const inicial = getEstoqueInicial();
  const dataIni = inicial.data || '';

  const saidasPorDia = {};
  lancamentos.forEach(l => {
    if (l.marca !== 'Ultragaz' && l.marca !== 'Butano') return;
    if (dataIni && l.data < dataIni) return;
    if (!saidasPorDia[l.data]) saidasPorDia[l.data] = { ultragaz: 0, butano: 0 };
    saidasPorDia[l.data][l.marca === 'Ultragaz' ? 'ultragaz' : 'butano'] += (l.qtd || 0);
  });

  const local = getEstoqueLocalAtual();
  const entradasPorDia = {};
  cargas.forEach(c => {
    if (!c.data) return;
    if (dataIni && c.data < dataIni) return;
    if (!_cargaPertenceAoLocal(c, local)) return;
    const itensP13 = (c.itens || []).filter(it => it.produto === 'P 13');
    if (!itensP13.length) return;
    if (!entradasPorDia[c.data]) entradasPorDia[c.data] = { ultragaz: 0, butano: 0 };
    itensP13.forEach(it => {
      const marca = it.marca === 'Butano' ? 'butano' : 'ultragaz';
      entradasPorDia[c.data][marca] += (it.qtd || 0);
    });
  });

  const todasDatas = [...new Set([...Object.keys(saidasPorDia), ...Object.keys(entradasPorDia)])].sort();

  let saldoU = parseFloat(inicial.ultragaz) || 0;
  let saldoB = parseFloat(inicial.butano) || 0;

  return todasDatas.map(data => {
    const entU = (entradasPorDia[data] && entradasPorDia[data].ultragaz) || 0;
    const entB = (entradasPorDia[data] && entradasPorDia[data].butano) || 0;
    const saiU = (saidasPorDia[data] && saidasPorDia[data].ultragaz) || 0;
    const saiB = (saidasPorDia[data] && saidasPorDia[data].butano) || 0;
    saldoU += entU - saiU;
    saldoB += entB - saiB;
    return { data, entU, saiU, saldoU, entB, saiB, saldoB, saldoTotal: saldoU + saldoB };
  });
}

function renderEstoque() {
  atualizarBotoesLocalEstoque();
  buildEstoqueMesOptions();

  const inicial = getEstoqueInicial();
  const elU = document.getElementById('eEstInicialUltra');
  const elB = document.getElementById('eEstInicialButano');
  const elD = document.getElementById('eEstInicialData');
  if (elU && document.activeElement !== elU) elU.value = inicial.ultragaz || '';
  if (elB && document.activeElement !== elB) elB.value = inicial.butano || '';
  if (elD && document.activeElement !== elD) elD.value = inicial.data || '';

  const historico = calcEstoqueDiario();

  const mes     = document.getElementById('eFiltMes')?.value || '';
  const dataIni = document.getElementById('eFiltDataIni')?.value || '';
  const dataFim = document.getElementById('eFiltDataFim')?.value || '';

  let visiveis = historico;
  if (dataIni || dataFim) {
    if (dataIni) visiveis = visiveis.filter(h => h.data >= dataIni);
    if (dataFim) visiveis = visiveis.filter(h => h.data <= dataFim);
  } else if (mes) {
    visiveis = visiveis.filter(h => h.data.startsWith(mes));
  }

  const ultimo = historico.length ? historico[historico.length - 1] : null;
  const saldoAtualU = ultimo ? ultimo.saldoU : (parseFloat(inicial.ultragaz) || 0);
  const saldoAtualB = ultimo ? ultimo.saldoB : (parseFloat(inicial.butano) || 0);
  const totalEntU = historico.reduce((a, h) => a + h.entU, 0);
  const totalSaiU = historico.reduce((a, h) => a + h.saiU, 0);
  const totalEntB = historico.reduce((a, h) => a + h.entB, 0);
  const totalSaiB = historico.reduce((a, h) => a + h.saiB, 0);

  document.getElementById('estoqueResumoCards').innerHTML = `
    <div class="summary-card"><div class="s-label">🔵 Saldo Atual Ultragaz</div><div class="s-value blue">${saldoAtualU}</div></div>
    <div class="summary-card"><div class="s-label">🟢 Saldo Atual Butano</div><div class="s-value bgreen">${saldoAtualB}</div></div>
    <div class="summary-card"><div class="s-label">📦 Saldo Total P13</div><div class="s-value">${saldoAtualU + saldoAtualB}</div></div>
    <div class="summary-card"><div class="s-label">🔵 Entradas / Saídas Ultra</div><div class="s-value blue" style="font-size:16px">${totalEntU} / ${totalSaiU}</div></div>
    <div class="summary-card"><div class="s-label">🟢 Entradas / Saídas Butano</div><div class="s-value bgreen" style="font-size:16px">${totalEntB} / ${totalSaiB}</div></div>
  `;

  const tbody = document.getElementById('tbodyEstoque');
  if (!visiveis.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty">Nenhum dado para o filtro selecionado.</td></tr>';
    return;
  }
  const ordenado = [...visiveis];
  tbody.innerHTML = ordenado.map(h => {
    const [y, mo, d] = h.data.split('-');
    return `<tr>
      <td>${d}/${mo}/${y}</td>
      <td style="text-align:right;color:var(--success)">${h.entU > 0 ? '+' + h.entU : '—'}</td>
      <td style="text-align:right;color:var(--danger)">${h.saiU > 0 ? '-' + h.saiU : '—'}</td>
      <td style="text-align:right;font-weight:700;color:var(--ultra)">${h.saldoU}</td>
      <td style="text-align:right;color:var(--success)">${h.entB > 0 ? '+' + h.entB : '—'}</td>
      <td style="text-align:right;color:var(--danger)">${h.saiB > 0 ? '-' + h.saiB : '—'}</td>
      <td style="text-align:right;font-weight:700;color:var(--butano)">${h.saldoB}</td>
      <td style="text-align:right;font-weight:700">${h.saldoTotal}</td>
    </tr>`;
  }).join('');
}

function _calcEstoqueOutroItem(produto) {
  const local = getEstoqueLocalAtual();
  const entradasPorDia = {};
  cargas.forEach(c => {
    if (!c.data || !c.itens) return;
    if (!_cargaPertenceAoLocal(c, local)) return;
    c.itens.filter(it => it.produto === produto).forEach(it => {
      entradasPorDia[c.data] = (entradasPorDia[c.data] || 0) + (it.qtd || 0);
    });
  });

  const saidasPorDia = {};
  lancamentos.forEach(l => {
    if (l.marca !== 'Produto' || l.produto !== produto) return;
    saidasPorDia[l.data] = (saidasPorDia[l.data] || 0) + (l.qtd || 0);
  });

  const todasDatas = [...new Set([...Object.keys(entradasPorDia), ...Object.keys(saidasPorDia)])].sort();

  let saldo = 0;
  return todasDatas.map(data => {
    const ent = entradasPorDia[data] || 0;
    const sai = saidasPorDia[data] || 0;
    saldo += ent - sai;
    return { data, ent, sai, saldo };
  });
}

function selecionarEstoqueOutro(produto, btnEl) {
  estoqueOutroAtual = produto;
  document.querySelectorAll('#estoqueOutrosTabs .pill-item').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  renderEstoqueOutro();
}

function renderEstoqueOutro() {
  const produto = estoqueOutroAtual;
  const conteudo = document.getElementById('estoqueOutrosConteudo');
  const vazio = document.getElementById('estoqueOutrosVazio');
  if (!produto) {
    if (conteudo) conteudo.style.display = 'none';
    if (vazio) vazio.style.display = '';
    return;
  }
  if (conteudo) conteudo.style.display = '';
  if (vazio) vazio.style.display = 'none';

  const historico = _calcEstoqueOutroItem(produto);
  document.getElementById('estoqueOutrosTitulo').textContent = `📦 Estoque — ${produto} (${getEstoqueLocalAtual()})`;

  const totalEnt  = historico.reduce((a, h) => a + h.ent, 0);
  const totalSai  = historico.reduce((a, h) => a + h.sai, 0);
  const saldoAtual = historico.length ? historico[historico.length - 1].saldo : 0;
  document.getElementById('estoqueOutrosCards').innerHTML = `
    <div class="summary-card"><div class="s-label">📦 Saldo Atual</div><div class="s-value">${saldoAtual}</div></div>
    <div class="summary-card"><div class="s-label">⬆️ Total Entradas</div><div class="s-value blue">${totalEnt}</div></div>
    <div class="summary-card"><div class="s-label">⬇️ Total Saídas</div><div class="s-value bgreen">${totalSai}</div></div>
  `;

  const tbody = document.getElementById('tbodyEstoqueOutros');
  if (!historico.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty">Nenhuma movimentação para este item neste local.</td></tr>';
  } else {
    tbody.innerHTML = historico.map(h => {
      const [y, mo, d] = h.data.split('-');
      return `<tr>
        <td>${d}/${mo}/${y}</td>
        <td style="text-align:right;color:var(--success)">${h.ent > 0 ? '+' + h.ent : '—'}</td>
        <td style="text-align:right;color:var(--danger)">${h.sai > 0 ? '-' + h.sai : '—'}</td>
        <td style="text-align:right;font-weight:700">${h.saldo}</td>
      </tr>`;
    }).join('');
  }
}

function abrirEstoqueOutros(produto) {
  const btn = document.querySelector(`#estoqueOutrosTabs .pill-item[data-produto="${produto}"]`);
  selecionarEstoqueOutro(produto, btn);
}

async function autoMarcarPago() {
  const hoje = hojeLocal();
  const limite = new Date(hoje + 'T12:00:00');
  limite.setDate(limite.getDate() - 3);
  const limiteStr = limite.toISOString().split('T')[0];
  let alterou = false;
  cargas.forEach(c => {
    if (
      (c.status === 'A VENCER' || c.status === 'VENCIDO' || c.status === 'PRORROGADO') &&
      c.venc && c.venc <= limiteStr
    ) {
      c.status = 'PAGO';
      alterou = true;
    }
  });
  if (alterou) {
    window._cargas = cargas;
    await saveCargas();
    showToast('✅ Cargas vencidas há 3+ dias marcadas como PAGO!');
    console.log('[auto-pago] Atualizado no Supabase.');
  }
}

function initCargasUI() {
  document.getElementById('cData').value = hojeLocal();
  buildItensCarga('cItensContainer', [{}]);
  calcVencimentoAuto();
  autoMarcarPago().then(() => renderCargas());

  // [CORREÇÃO] Verificações para evitar erro "Cannot read properties of null"
  const modalEdit = document.getElementById('editCargaModal');
  if (modalEdit) {
    modalEdit.addEventListener('click', function(e){
      if(false) fecharCargaModal();
    });
  }
  const modalFrete = document.getElementById('freteConfigModal');
  if (modalFrete) {
    modalFrete.addEventListener('click', function(e){
      if(false) fecharFreteConfig();
    });
  }
  const modalProrrogar = document.getElementById('prorrogarModal');
  if (modalProrrogar) {
    modalProrrogar.addEventListener('click', function(e){
      if(false) fecharProrrogar();
    });
  }
}

async function saveCargas() {
  window._cargas = cargas;
  try {
    await window._saveCargas();
  } catch(e) { console.error('Erro ao salvar cargas:', e); }
}

function addDiasUteis(dataStr, dias) {
  const d = new Date(dataStr + 'T12:00:00');
  d.setDate(d.getDate() + dias);
  const dow = d.getDay();
  if (dow === 6) d.setDate(d.getDate() + 2);
  if (dow === 0) d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

function calcVencimentoAuto() {
  const data = document.getElementById('cData').value;
  const empresa = document.getElementById('cEmpresa').value;
  if (data) {
    const dias = (empresa && empresaDiasConfig[empresa] != null)
      ? empresaDiasConfig[empresa]
      : (empresa ? (EMPRESAS_VENC.find(e => e.nome === empresa)?.diasPadrao || 5) : 5);
    document.getElementById('cVenc').value = addDiasUteis(data, dias);
  }
}

function calcFreteAuto() {
  let totalFrete = 0;
  let i = 0;
  while (document.getElementById(`cItensContainer_qtd_${i}`) !== null) {
    const produto = document.getElementById(`cItensContainer_prod_${i}`).value;
    const qtd = parseFloat(document.getElementById(`cItensContainer_qtd_${i}`).value) || 0;
    const valorUnit = freteConfig[produto] || 0;
    if (valorUnit > 0 && qtd > 0) totalFrete += valorUnit * qtd;
    i++;
  }
  if (totalFrete > 0) document.getElementById('cFrete').value = totalFrete.toFixed(2);
}

function calcEditFreteAuto() {
  let totalFrete = 0;
  let i = 0;
  while (document.getElementById(`ecItensContainer_qtd_${i}`) !== null) {
    const produto = document.getElementById(`ecItensContainer_prod_${i}`).value;
    const qtd = parseFloat(document.getElementById(`ecItensContainer_qtd_${i}`).value) || 0;
    const valorUnit = freteConfig[produto] || 0;
    if (valorUnit > 0 && qtd > 0) totalFrete += valorUnit * qtd;
    i++;
  }
  if (totalFrete > 0) document.getElementById('ecFrete').value = totalFrete.toFixed(2);
}

function abrirFreteConfig() {
  const grid = document.getElementById('freteConfigGrid');
  if (!grid) return;
  grid.innerHTML = PRODUTOS_FRETE.map(p => {
    const safeid = p.replace(/[^a-zA-Z0-9]/g,'_');
    return `<div style="background:var(--surface2);border:1.5px solid var(--border);border-radius:10px;padding:12px;">
      <label style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);display:block;margin-bottom:6px;">🛢️ ${p}</label>
      <div style="display:flex;align-items:center;gap:6px;">
        <span style="font-size:12px;color:var(--muted)">R$/bot:</span>
        <input type="number" id="frete_${safeid}" min="0" step="0.01" value="${freteConfig[p]||''}" placeholder="0,00"
          style="flex:1;background:#fff;border:1.5px solid var(--border);color:var(--text);padding:7px 9px;border-radius:7px;font-family:'DM Sans',sans-serif;font-size:13px;outline:none;width:100%;" />
      </div>
    </div>`;
  }).join('');

  const hoje = hojeLocal();
  const tbody = document.getElementById('empresaDiasBody');
  if (tbody) {
    tbody.innerHTML = EMPRESAS_VENC.map(e => {
      const dias = empresaDiasConfig[e.nome] != null ? empresaDiasConfig[e.nome] : e.diasPadrao;
      const exemplVenc = addDiasUteis(hoje, dias);
      const [y,m,d] = exemplVenc.split('-');
      return `<tr>
        <td style="font-weight:700">${e.nome}</td>
        <td style="text-align:center">
          <input type="number" id="dias_${e.nome}" min="1" max="30" value="${dias}"
            onchange="atualizarExemploDias('${e.nome}')"/>
        </td>
        <td style="text-align:center;color:var(--ultra);font-weight:600;font-size:12px;" id="ex_${e.nome}">${d}/${m}/${y}</td>
      </tr>`;
    }).join('');
  }

  const modalFrete = document.getElementById('freteConfigModal');
  if (modalFrete) modalFrete.classList.add('open');
}

function atualizarExemploDias(empresa) {
  const input = document.getElementById('dias_' + empresa);
  const dias = parseInt(input.value) || 5;
  const hoje = hojeLocal();
  const venc = addDiasUteis(hoje, dias);
  const [y,m,d] = venc.split('-');
  document.getElementById('ex_' + empresa).textContent = d+'/'+m+'/'+y;
}

function fecharFreteConfig() {
  const modalFrete = document.getElementById('freteConfigModal');
  if (modalFrete) modalFrete.classList.remove('open');
}

async function salvarFreteConfig() {
  PRODUTOS_FRETE.forEach(p => {
    const safeid = p.replace(/[^a-zA-Z0-9]/g,'_');
    const el = document.getElementById('frete_' + safeid);
    if (el) freteConfig[p] = parseFloat(el.value) || 0;
  });
  EMPRESAS_VENC.forEach(e => {
    const el = document.getElementById('dias_' + e.nome);
    if (el) empresaDiasConfig[e.nome] = parseInt(el.value) || e.diasPadrao;
  });
  window._freteConfig = freteConfig;
  window._empresaDiasConfig = empresaDiasConfig;
  try {
    await window._fbSetDoc('config', 'frete', freteConfig);
    await window._fbSetDoc('config', 'empresa_dias', empresaDiasConfig);
  } catch(e) { console.error('Erro ao salvar config frete/dias:', e); }

  const m = document.getElementById('freteConfigMsg');
  if (m) {
    m.textContent = '✓ Salvo!';
    setTimeout(() => { m.textContent = ''; fecharFreteConfig(); }, 1200);
  }
  showToast('✓ Config. de frete salva!');
}

let _statusPopupCargaId = null;

function abrirStatusQS(id, ev) {
  if (ev) { ev.preventDefault(); ev.stopPropagation(); }
  _statusPopupCargaId = id;
  const modalStatus = document.getElementById('statusQSModal');
  if (modalStatus) modalStatus.classList.add('open');
}

function fecharStatusQS() {
  const modalStatus = document.getElementById('statusQSModal');
  if (modalStatus) modalStatus.classList.remove('open');
}

async function setStatusCarga(id, novoStatus) {
  if (id == null) return;
  const idx = cargas.findIndex(c => c.id === id);
  if (idx === -1) return;
  cargas[idx].status = novoStatus;
  await saveCargas();
  renderCargas();
  fecharStatusQS();
  const labels = {'PAGO':'✅ Pago!','A VENCER':'⏳ A Vencer!','VENCIDO':'❌ Vencido!','CANCELADO':'🚫 Cancelado!'};
  showToast(labels[novoStatus] || '✓ Status atualizado!');
}

function setStatusProrrogado(id) {
  fecharStatusQS();
  if (id != null) _statusPopupCargaId = id;
  const carga = cargas.find(c => c.id === id);
  const input = document.getElementById('prorrogarData');
  if (carga && carga.venc) {
    const d = new Date(carga.venc + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    input.value = d.toISOString().split('T')[0];
  } else {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    input.value = d.toISOString().split('T')[0];
  }
  document.getElementById('prorrogarModal').dataset.origem = 'tabela';
  document.getElementById('prorrogarModal').classList.add('open');
}

function abrirProrrogar() {
  const vencAtual = document.getElementById('cVenc').value;
  const input = document.getElementById('prorrogarData');
  if (vencAtual) {
    const d = new Date(vencAtual + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    input.value = d.toISOString().split('T')[0];
  } else {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    input.value = d.toISOString().split('T')[0];
  }
  const modal = document.getElementById('prorrogarModal');
  if (modal) {
    modal.dataset.origem = 'form';
    modal.classList.add('open');
  }
}

function fecharProrrogar() {
  const modal = document.getElementById('prorrogarModal');
  if (modal) modal.classList.remove('open');
}

async function confirmarProrrogar() {
  const novaData = document.getElementById('prorrogarData').value;
  if (!novaData) { showToast('⚠ Informe a nova data de vencimento!'); return; }
  const origem = document.getElementById('prorrogarModal').dataset.origem;
  if (origem === 'tabela' && _statusPopupCargaId != null) {
    const idx = cargas.findIndex(c => c.id === _statusPopupCargaId);
    if (idx !== -1) {
      cargas[idx].status = 'PRORROGADO';
      cargas[idx].venc   = novaData;
      saveCargas();
      renderCargas();
      showToast('📅 Boleto prorrogado!');
    }
    _statusPopupCargaId = null;
  } else {
    document.getElementById('cVenc').value = novaData;
    showToast('📅 Vencimento prorrogado!');
  }
  fecharProrrogar();
}

function calcCargaLiquido() {
  const v = parseFloat(document.getElementById('cValor').value) || 0;
  const d = parseFloat(document.getElementById('cDesconto').value) || 0;
  const liq = v - d;
  document.getElementById('cLiquido').value = liq > 0 ? 'R$ ' + fmtNum(liq) : '';
}
function calcEditCargaLiquido() {
  const v = parseFloat(document.getElementById('ecValor').value) || 0;
  const d = parseFloat(document.getElementById('ecDesconto').value) || 0;
  document.getElementById('ecLiquido').value = 'R$ ' + fmtNum(v - d);
}

async function addCarga() {
  const err = document.getElementById('cargaErr');
  const data    = document.getElementById('cData').value;
  const empresa = document.getElementById('cEmpresa').value;

  if (!data)    { err.textContent = '⚠ Informe a data da carga.'; return; }
  if (!empresa) { err.textContent = '⚠ Informe a empresa.'; return; }

  const itens = getItensCarga('cItensContainer');
  const itensValidos = itens.filter(it => it.qtd > 0 && it.produto);
  if (!itensValidos.length) { err.textContent = '⚠ Adicione ao menos 1 item com quantidade e produto.'; return; }

  err.textContent = '';

  const valorRaw = document.getElementById('cValor').value;
  const valor    = parseFloat(valorRaw) || 0;
  const desconto = parseFloat(document.getElementById('cDesconto').value) || 0;
  const qtdTotal = itensValidos.reduce((a, it) => a + it.qtd, 0);
  const produtoLabel = itensValidos.length === 1
    ? itensValidos[0].produto
    : itensValidos.map(it => `${it.qtd} ${it.produto}`).join(' + ');

  const dadosBase = {
    data,
    produto:   produtoLabel,
    itens:     itensValidos,
    nf:        document.getElementById('cNF').value.trim(),
    empresa,
    transp:    document.getElementById('cTransp').value,
    caminhao:  document.getElementById('cCaminhao').value,
    tipo:      document.getElementById('cTipo').value,
    descarga:  document.getElementById('cDescarga').value,
    qtd:       qtdTotal,
    valor,
    desconto,
    liquido:   valor - desconto,
    frete:     parseFloat(document.getElementById('cFrete').value) || 0,
    venc:      document.getElementById('cVenc').value,
    status:    document.getElementById('cStatus').value,
    obs:       document.getElementById('cObs').value.trim(),
  };

  if (!valorRaw || valor <= 0) {
    _pendingCarga = dadosBase;
    const modalTroca = document.getElementById('trocaModal');
    if (modalTroca) modalTroca.classList.add('open');
    return;
  }

  await finalizarNovaCarga({ ...dadosBase, troca: false });
}

let _pendingCarga = null;

async function resolverTroca(isTroca) {
  const modalTroca = document.getElementById('trocaModal');
  if (modalTroca) modalTroca.classList.remove('open');
  if (!_pendingCarga) return;
  await finalizarNovaCarga({ ..._pendingCarga, troca: isTroca });
  _pendingCarga = null;
  showToast(isTroca ? '🔄 Troca registrada!' : '✅ Carga registrada!');
}

async function finalizarNovaCarga(dados) {
  const carga = { id: Date.now(), ...dados };
  cargas.push(carga);
  await saveCargas();
  renderCargas();
  if (dados.valor > 0) showToast('✅ Carga registrada!');

  ['cValor','cDesconto','cLiquido','cFrete','cObs','cNF'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('cEmpresa').value = '';
  document.getElementById('cTransp').value = 'IVG TRANSPORTES';
  document.getElementById('cCaminhao').value = '';
  document.getElementById('cTipo').value = 'Ultragaz';
  document.getElementById('cDescarga').value = 'Franco da Rocha';
  document.getElementById('cStatus').value = 'A VENCER';
  document.getElementById('cData').value = hojeLocal();
  buildItensCarga('cItensContainer', [{}]);
  numItensCarga = 1;
  calcVencimentoAuto();
}

async function deleteCarga(id) {
  if (!confirm('Remover esta carga?')) return;
  cargas = cargas.filter(c => c.id !== id);
  await saveCargas();
  renderCargas();
}

function abrirEdicaoCarga(id) {
  const c = cargas.find(x => x.id === id);
  if (!c) return;
  document.getElementById('editCargaId').value   = id;
  document.getElementById('ecData').value         = c.data;
  document.getElementById('ecNF').value            = c.nf || '';
  document.getElementById('ecEmpresa').value       = c.empresa;
  document.getElementById('ecTransp').value        = c.transp || 'IVG TRANSPORTES';
  document.getElementById('ecCaminhao').value      = c.caminhao || '';
  document.getElementById('ecTipo').value          = c.tipo || 'Ultragaz';
  document.getElementById('ecDescarga').value      = c.descarga || 'Franco da Rocha';
  const itens = c.itens && c.itens.length
    ? c.itens
    : [{ qtd: c.qtd || 0, produto: c.produto || '' }];
  buildItensCarga('ecItensContainer', itens);
  document.getElementById('ecValor').value         = c.valor || '';
  document.getElementById('ecDesconto').value      = c.desconto || '';
  document.getElementById('ecLiquido').value       = c.valor ? 'R$ ' + fmtNum(c.liquido || c.valor) : '';
  document.getElementById('ecFrete').value         = c.frete || '';
  document.getElementById('ecVenc').value          = c.venc || '';
  document.getElementById('ecStatus').value        = c.status;
  document.getElementById('ecObs').value           = c.obs || '';
  document.getElementById('editCargaErr').textContent = '';
  const modalEditCarga = document.getElementById('editCargaModal');
  if (modalEditCarga) modalEditCarga.classList.add('open');
}

function fecharCargaModal() {
  const modal = document.getElementById('editCargaModal');
  if (modal) modal.classList.remove('open');
}

async function salvarEdicaoCarga() {
  const id  = parseInt(document.getElementById('editCargaId').value);
  const idx = cargas.findIndex(x => x.id === id);
  if (idx === -1) return;
  const err = document.getElementById('editCargaErr');
  const data    = document.getElementById('ecData').value;
  const empresa = document.getElementById('ecEmpresa').value;
  if (!data)    { err.textContent = '⚠ Informe a data.'; return; }
  if (!empresa) { err.textContent = '⚠ Informe a empresa.'; return; }

  const itens = getItensCarga('ecItensContainer');
  const itensValidos = itens.filter(it => it.qtd > 0 && it.produto);
  if (!itensValidos.length) { err.textContent = '⚠ Adicione ao menos 1 item com quantidade e produto.'; return; }

  err.textContent = '';
  const valor   = parseFloat(document.getElementById('ecValor').value) || 0;
  const desconto = parseFloat(document.getElementById('ecDesconto').value) || 0;
  const qtdTotal = itensValidos.reduce((a, it) => a + it.qtd, 0);
  const produtoLabel = itensValidos.length === 1
    ? itensValidos[0].produto
    : itensValidos.map(it => `${it.qtd} ${it.produto}`).join(' + ');

  cargas[idx] = {
    ...cargas[idx],
    data,
    produto:  produtoLabel,
    itens:    itensValidos,
    nf:       document.getElementById('ecNF').value.trim(),
    empresa,
    transp:   document.getElementById('ecTransp').value,
    caminhao: document.getElementById('ecCaminhao').value,
    tipo:     document.getElementById('ecTipo').value,
    descarga: document.getElementById('ecDescarga').value,
    qtd:      qtdTotal,
    valor,
    desconto,
    liquido:  valor - desconto,
    frete:    parseFloat(document.getElementById('ecFrete').value) || 0,
    venc:     document.getElementById('ecVenc').value,
    status:   document.getElementById('ecStatus').value,
    obs:      document.getElementById('ecObs').value.trim(),
  };
  await saveCargas();
  renderCargas();
  fecharCargaModal();
  showToast('✓ Carga atualizada!');
}

function renderCargas() {
  buildCargasMesOptions();
  buildCargasEmpresaOptions();

  const fEmpresa = document.getElementById('cfEmpresa').value;
  const fProd    = document.getElementById('cfProduto').value;
  const fStatus  = document.getElementById('cfStatus').value;
  const fMes     = document.getElementById('cfMes').value;

  let f = [...cargas];
  if (fEmpresa) f = f.filter(c => c.empresa === fEmpresa);
  if (fProd)    f = f.filter(c => c.produto === fProd);
  if (fStatus)  f = f.filter(c => c.status === fStatus);
  if (fMes)     f = f.filter(c => c.data.startsWith(fMes));

  const totalValor   = f.reduce((a, c) => a + c.valor, 0);
  const totalLiquido = f.reduce((a, c) => a + (c.liquido || c.valor), 0);
  const totalFrete   = f.reduce((a, c) => a + (c.frete || 0), 0);
  const totalPago    = f.filter(c => c.status === 'PAGO').reduce((a, c) => a + (c.liquido || c.valor), 0);
  const totalVencido = f.filter(c => c.status === 'VENCIDO').reduce((a, c) => a + (c.liquido || c.valor), 0);
  const cargasTroca  = f.filter(c => c.troca);
  const totalTrocaQtd = cargasTroca.reduce((a, c) => a + (c.qtd || 0), 0);

  const hoje = hojeLocal();
  const proximas = cargas
    .filter(c => (c.status === 'A VENCER' || c.status === 'PRORROGADO') && c.venc)
    .sort((a, b) => a.venc.localeCompare(b.venc))
    .slice(0, 5);

  function diasParaVenc(vencStr) {
    const hoje2 = new Date(); hoje2.setHours(0,0,0,0);
    const vd = new Date(vencStr + 'T12:00:00');
    return Math.round((vd - hoje2) / 86400000);
  }
  function fmtDateShort(d) { const [y,m,dd]=d.split('-'); return `${dd}/${m}`; }

  const proximasHtml = proximas.length === 0
    ? `<div class="proximas-empty">✅ Nenhuma carga pendente de vencimento</div>`
    : proximas.map(c => {
        const dias = diasParaVenc(c.venc);
        let vencClass = 'ok', diasClass = 'ok', diasLabel = `em ${dias}d`;
        if (dias < 0)      { vencClass = 'hoje'; diasClass = 'urgente'; diasLabel = `${Math.abs(dias)}d atrás`; }
        else if (dias === 0){ vencClass = 'hoje'; diasClass = 'urgente'; diasLabel = 'HOJE'; }
        else if (dias <= 2) { vencClass = 'amanha'; diasClass = 'urgente'; diasLabel = `em ${dias}d`; }
        else if (dias <= 5) { vencClass = 'amanha'; diasClass = 'atencao'; diasLabel = `em ${dias}d`; }
        return `<div class="proxima-item">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span class="proxima-venc ${vencClass}">${fmtDateShort(c.venc)}</span>
            <span class="proxima-dias ${diasClass}">${diasLabel}</span>
          </div>
          <span class="proxima-empresa">${c.empresa || '—'}</span>
          <span style="font-weight:400;color:var(--muted);font-size:11px">${c.produto||''} ${c.nf ? '· NF '+c.nf : ''}</span>
          <span class="proxima-valor">${c.valor>0?fmtVal(c.liquido || c.valor):'—'}</span>
        </div>`;
      }).join('');

  const qtdAvencer = cargas.filter(c => c.status === 'A VENCER' || c.status === 'PRORROGADO').length;
  const totalDesconto = f.reduce((a, c) => a + (c.desconto || 0), 0);

  document.getElementById('cargaSummary').innerHTML = `
    <div class="carga-sum-card card-orange"><div class="cs-icon-wrap">🚛</div><div class="cs-info"><div class="cs-label">Nº de Cargas</div><div class="cs-value orange">${f.length}</div></div></div>
    <div class="carga-sum-card card-teal"><div class="cs-icon-wrap">💰</div><div class="cs-info"><div class="cs-label">Valor Total</div><div class="cs-value">${fmtVal(totalValor)}</div></div></div>
    <div class="carga-sum-card card-sky"><div class="cs-icon-wrap">🧾</div><div class="cs-info"><div class="cs-label">Valor Líquido</div><div class="cs-value blue">${fmtVal(totalLiquido)}</div></div></div>
    <div class="carga-sum-card card-green"><div class="cs-icon-wrap">✅</div><div class="cs-info"><div class="cs-label">Total Pago</div><div class="cs-value" style="color:var(--success)">${fmtVal(totalPago)}</div></div></div>
    <div class="carga-sum-card card-yellow"><div class="cs-icon-wrap">🔄</div><div class="cs-info"><div class="cs-label">Trocas</div><div class="cs-value orange">${totalTrocaQtd} <span style="font-size:11px;font-weight:600">(${cargasTroca.length} carga${cargasTroca.length!==1?'s':''})</span></div></div></div>
    <div class="carga-sum-card card-blue"><div class="cs-icon-wrap">🚚</div><div class="cs-info"><div class="cs-label">Total Frete</div><div class="cs-value blue">${fmtVal(totalFrete)}</div></div></div>
    <div class="carga-sum-card card-red"><div class="cs-icon-wrap">❌</div><div class="cs-info"><div class="cs-label">Vencidas</div><div class="cs-value red">${fmtVal(totalVencido)}</div></div></div>
    <div class="carga-sum-card card-purple"><div class="cs-icon-wrap">🏷️</div><div class="cs-info"><div class="cs-label">Total Descontos</div><div class="cs-value" style="color:#7c3aed">${fmtVal(totalDesconto)}</div></div></div>
    <div class="card-proximas">
      <div class="proximas-header">
        <span style="font-size:20px">📅</span>
        <span class="proximas-title">Próximas a Vencer</span>
        <span class="proximas-badge">${qtdAvencer} pendente${qtdAvencer !== 1 ? 's' : ''}</span>
      </div>
      <div class="proximas-list">${proximasHtml}</div>
    </div>
  `;

  const tb = document.getElementById('tbodyCargas');
  if (!f.length) {
    tb.innerHTML = '<tr><td colspan="16" class="empty">Nenhuma carga para os filtros selecionados.</td></tr>';
    const tfootEl2 = document.getElementById('tfootCargas');
    if (tfootEl2) tfootEl2.innerHTML = '';
    return;
  }

  const tfootEl = document.getElementById('tfootCargas');
  const sumQtd     = f.reduce((a, c) => a + (c.qtd || 0), 0);
  const sumValor   = f.reduce((a, c) => a + (c.valor || 0), 0);
  const sumDesc    = f.reduce((a, c) => a + (c.desconto || 0), 0);
  const sumLiquido = f.reduce((a, c) => a + (c.liquido || c.valor || 0), 0);
  const sumFrete   = f.reduce((a, c) => a + (c.frete || 0), 0);

  const PESO_PRODUTO = { 'P 05': 5, 'P 13': 13, 'P 20': 20, 'P 45': 45 };
  function getPesoKg(produto) { return PESO_PRODUTO[produto] || 0; }
  const sumKg = f.reduce((a, c) => {
    if (c.itens && c.itens.length > 0) {
      return a + c.itens.reduce((s, it) => s + (it.qtd || 0) * getPesoKg(it.produto), 0);
    }
    return a + (c.qtd || 0) * getPesoKg(c.produto);
  }, 0);
  const sumTon = sumKg / 1000;
  const tonDisplay = sumTon >= 1
    ? sumTon.toFixed(2).replace('.', ',') + ' t'
    : (sumKg).toFixed(0) + ' kg';

  if (tfootEl) {
    tfootEl.innerHTML = `<tr style="background:linear-gradient(90deg,#fff3e0,#fef9e7);font-weight:700;border-top:2px solid var(--accent);">
      <td style="text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);font-weight:700;padding:10px 8px;" colspan="7">TOTAIS (${f.length} registro${f.length!==1?'s':''})</td>
      <td style="text-align:center;font-family:'Bebas Neue',sans-serif;font-size:18px;color:var(--accent)">${sumQtd}</td>
      <td style="font-weight:700;color:#0f766e">${fmtVal(sumValor)}</td>
      <td style="color:var(--danger);font-weight:700">${sumDesc > 0 ? fmtVal(sumDesc) : '-'}</td>
      <td style="font-weight:700;color:var(--success)">${fmtVal(sumLiquido)}</td>
      <td style="color:var(--ultra);font-weight:700">${sumFrete > 0 ? fmtVal(sumFrete) : '-'}</td>
      <td colspan="4" style="text-align:left;padding-left:12px;">
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);line-height:1.2;">PESO</div>
        <div style="font-family:'Bebas Neue',sans-serif;font-size:18px;font-weight:700;color:var(--text);letter-spacing:.5px;">${tonDisplay}</div>
      </td>
    </tr>`;
  }

  tb.innerHTML = [...f].sort((a, b) => b.data.localeCompare(a.data)).map(c => {
    let badgeClass = 'status-avencer';
    if (c.status === 'PAGO')       badgeClass = 'status-pago';
    if (c.status === 'VENCIDO')    badgeClass = 'status-vencido';
    if (c.status === 'CANCELADO')  badgeClass = 'status-cancelado';
    if (c.status === 'PRORROGADO') badgeClass = 'status-avencer';
    const statusLabel = c.status === 'PRORROGADO' ? '📅 PRORROGADO' : c.status;
    const caminhaoLabel = c.caminhao ? `🚛 ${c.caminhao}` : '-';
    const tipoLabel = c.tipo === 'Butano' ? '🟢 Butano' : '🔵 Ultragaz';
    const vencDisplay = c.venc ? fmtDate(c.venc) : '-';
    const vencStyle = c.status === 'PRORROGADO' ? 'color:var(--ultra);font-weight:700' : 'color:var(--muted)';
    const itensDisplay = c.itens && c.itens.length > 1
      ? c.itens.map(it => `<div style="font-size:11px;white-space:nowrap"><strong>${it.qtd}</strong> × ${it.produto}</div>`).join('')
      : `<span style="font-weight:600">${c.produto || '—'}</span>`;
    return `<tr>
      <td>${fmtDate(c.data)}</td>
      <td>${itensDisplay}</td>
      <td style="color:var(--muted);font-size:11px">${c.nf || '-'}</td>
      <td style="font-weight:700">${c.empresa}</td>
      <td style="color:var(--muted)">${c.transp || '-'}</td>
      <td style="color:var(--muted);font-size:11px">${caminhaoLabel}<br><span style="font-size:10px">${tipoLabel}</span></td>
      <td style="color:var(--muted);font-size:11px;white-space:nowrap">📍 ${c.descarga || '-'}</td>
      <td style="text-align:center;font-family:'Bebas Neue',sans-serif;font-size:18px">${c.qtd || '-'}</td>
      <td class="td-valor">${c.valor > 0 ? fmtVal(c.valor) : '-'}</td>
      <td style="color:var(--danger)">${c.desconto ? fmtVal(c.desconto) : '-'}</td>
      <td class="td-liquido">${c.valor > 0 ? fmtVal(c.liquido || c.valor) : '-'}</td>
      <td class="td-frete">${c.frete ? fmtVal(c.frete) : '-'}</td>
      <td style="${vencStyle}">${vencDisplay}</td>
      <td>
        <span class="status-badge ${badgeClass}" onclick="abrirStatusQS(${c.id}, event)">${statusLabel} ▾</span>
      </td>
      <td style="color:var(--muted);font-size:11px;max-width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.obs || '-'}</td>
      <td style="white-space:nowrap">
        <button class="btn-sm-edit" onclick="abrirEdicaoCarga(${c.id})">✏️</button>
        <button class="btn-sm-del" onclick="deleteCarga(${c.id})">✕</button>
      </td>
    </tr>`;
  }).join('');
}

function buildCargasMesOptions() {
  const sel = document.getElementById('cfMes');
  const cur = sel.value;
  const meses = new Set(cargas.map(c => c.data.slice(0, 7)));
  const sorted = [...meses].sort().reverse();
  sel.innerHTML = '<option value="">Todos</option>';
  sorted.forEach(m => {
    const [y, mo] = m.split('-');
    const o = document.createElement('option');
    o.value = m;
    o.textContent = `${MESES_PT[parseInt(mo, 10) - 1]} ${y}`;
    if (m === cur) o.selected = true;
    sel.appendChild(o);
  });
}

function buildCargasEmpresaOptions() {
  const sel = document.getElementById('cfEmpresa');
  const cur = sel.value;
  const empresas = [...new Set(cargas.map(c => c.empresa))].sort();
  sel.innerHTML = '<option value="">Todas</option>';
  empresas.forEach(e => {
    const o = document.createElement('option');
    o.value = e; o.textContent = e;
    if (e === cur) o.selected = true;
    sel.appendChild(o);
  });
}

function exportarPDFCargas() {
  const fEmpresa = document.getElementById('cfEmpresa').value;
  const fProd    = document.getElementById('cfProduto').value;
  const fStatus  = document.getElementById('cfStatus').value;
  const fMes     = document.getElementById('cfMes').value;

  let f = [...cargas];
  if (fEmpresa) f = f.filter(c => c.empresa === fEmpresa);
  if (fProd)    f = f.filter(c => c.produto === fProd);
  if (fStatus)  f = f.filter(c => c.status === fStatus);
  if (fMes)     f = f.filter(c => c.data.startsWith(fMes));

  if (!f.length) { showToast('⚠ Nenhuma carga para exportar!'); return; }

  let mesLabel = 'Todos os meses';
  if (fMes) { const [y, mo] = fMes.split('-'); mesLabel = `${MESES_PT[parseInt(mo,10)-1]} ${y}`; }
  const empresaLabel = fEmpresa || 'Todas as empresas';
  const prodLabel    = fProd    || 'Todos os produtos';
  const statusLabel  = fStatus  || 'Todos os status';

  const sumQtd     = f.reduce((a, c) => a + (c.qtd || 0), 0);
  const sumValor   = f.reduce((a, c) => a + (c.valor || 0), 0);
  const sumDesc    = f.reduce((a, c) => a + (c.desconto || 0), 0);
  const sumLiquido = f.reduce((a, c) => a + (c.liquido || c.valor || 0), 0);
  const sumFrete   = f.reduce((a, c) => a + (c.frete || 0), 0);
  const totalPago  = f.filter(c => c.status === 'PAGO').reduce((a, c) => a + (c.liquido || c.valor || 0), 0);
  const totalVenc  = f.filter(c => c.status === 'VENCIDO').reduce((a, c) => a + (c.liquido || c.valor || 0), 0);
  const cargasTrocaPDF   = f.filter(c => c.troca);
  const totalTrocaQtdPDF = cargasTrocaPDF.reduce((a, c) => a + (c.qtd || 0), 0);

  const PESO_PROD_PDF = { 'P 05': 5, 'P 13': 13, 'P 20': 20, 'P 45': 45 };
  const pdfSumKg = f.reduce((a, c) => {
    if (c.itens && c.itens.length > 0)
      return a + c.itens.reduce((s, it) => s + (it.qtd || 0) * (PESO_PROD_PDF[it.produto] || 0), 0);
    return a + (c.qtd || 0) * (PESO_PROD_PDF[c.produto] || 0);
  }, 0);
  const pdfSumTon = pdfSumKg / 1000;
  const pdfTonDisplay = pdfSumTon >= 1
    ? pdfSumTon.toFixed(2).replace('.', ',') + ' t'
    : pdfSumKg.toFixed(0) + ' kg';

  const statusBadge = s => {
    const map = {
      'PAGO':      'background:#dcfce7;color:#15803d;border:1px solid #bbf7d0',
      'A VENCER':  'background:#fef9c3;color:#854d0e;border:1px solid #fde68a',
      'VENCIDO':   'background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5',
      'PRORROGADO':'background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe',
      'CANCELADO': 'background:#f3f4f6;color:#6b7280;border:1px solid #d1d5db',
    };
    return `<span style="display:inline-block;padding:2px 8px;border-radius:8px;font-size:10px;font-weight:700;${map[s]||map['A VENCER']}">${s}</span>`;
  };

  const rowHtmlPdf = c => {
    const itensDisplay = c.itens && c.itens.length > 1
      ? c.itens.map(it => `${it.qtd}×${it.produto}`).join(', ')
      : (c.produto || '—');
    const vencDisplay = c.venc ? (() => { const [y,m,d]=c.venc.split('-'); return `${d}/${m}/${y}`; })() : '-';
    const dataDisplay = (() => { const [y,m,d]=c.data.split('-'); return `${d}/${m}/${y}`; })();
    const trocaTag = c.troca ? ' <span style="display:inline-block;padding:1px 6px;border-radius:6px;font-size:9px;font-weight:700;background:#ffe8cc;color:#c96d00;border:1px solid #ffd8a8;margin-left:4px">🔄 TROCA</span>' : '';
    return `<tr>
      <td>${dataDisplay}</td>
      <td>${itensDisplay}${trocaTag}</td>
      <td style="color:#6b7280;font-size:11px">${c.nf || '-'}</td>
      <td style="font-weight:700">${c.empresa || '-'}</td>
      <td style="color:#6b7280;font-size:11px">${c.transp || '-'}</td>
      <td style="color:#6b7280;font-size:11px">${c.caminhao ? '🚛 '+c.caminhao : '-'}</td>
      <td style="text-align:center;font-weight:700;font-size:16px">${c.qtd || '-'}</td>
      <td style="font-weight:700;color:#0f766e">${c.valor > 0 ? 'R$ '+fmtNum(c.valor) : '-'}</td>
      <td style="color:#dc2626">${c.desconto ? 'R$ '+fmtNum(c.desconto) : '-'}</td>
      <td style="font-weight:700;color:#15803d">${c.valor > 0 ? 'R$ '+fmtNum(c.liquido || c.valor) : '-'}</td>
      <td style="color:#1d4ed8">${c.frete ? 'R$ '+fmtNum(c.frete) : '-'}</td>
      <td style="color:#6b7280">${vencDisplay}</td>
      <td>${statusBadge(c.status)}</td>
      <td style="color:#6b7280;font-size:10px;max-width:100px;word-break:break-word">${c.obs || '-'}</td>
    </tr>`;
  };

  const gruposEmpresa = {};
  f.forEach(c => {
    const emp = c.empresa || 'Sem empresa';
    (gruposEmpresa[emp] = gruposEmpresa[emp] || []).push(c);
  });
  const empresasOrdenadas = Object.keys(gruposEmpresa).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const rows = empresasOrdenadas.map(emp => {
    const cs = [...gruposEmpresa[emp]].sort((a, b) => b.data.localeCompare(a.data));
    const subQtd     = cs.reduce((a, c) => a + (c.qtd || 0), 0);
    const subValor   = cs.reduce((a, c) => a + (c.valor || 0), 0);
    const subDesc    = cs.reduce((a, c) => a + (c.desconto || 0), 0);
    const subLiquido = cs.reduce((a, c) => a + (c.liquido || c.valor || 0), 0);
    const subFrete   = cs.reduce((a, c) => a + (c.frete || 0), 0);
    const subTroca   = cs.filter(c => c.troca).reduce((a, c) => a + (c.qtd || 0), 0);

    const headerRow = `<tr class="empresa-group-header">
      <td colspan="14">🏢 ${emp} <span style="font-weight:400;opacity:.75;font-size:10px">— ${cs.length} carga${cs.length !== 1 ? 's' : ''}${subTroca ? ` · 🔄 ${subTroca} troca(s)` : ''}</span></td>
    </tr>`;
    const bodyRows = cs.map(rowHtmlPdf).join('');
    const subtotalRow = `<tr class="empresa-subtotal">
      <td colspan="6" style="text-align:right;font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;font-weight:700">Subtotal ${emp}</td>
      <td style="text-align:center;font-weight:700;font-size:14px;color:#e07b00">${subQtd}</td>
      <td style="font-weight:700;color:#0f766e">R$ ${fmtNum(subValor)}</td>
      <td style="color:#dc2626;font-weight:700">${subDesc > 0 ? 'R$ '+fmtNum(subDesc) : '-'}</td>
      <td style="font-weight:700;color:#15803d">R$ ${fmtNum(subLiquido)}</td>
      <td style="color:#1d4ed8;font-weight:700">${subFrete > 0 ? 'R$ '+fmtNum(subFrete) : '-'}</td>
      <td colspan="3"></td>
    </tr>`;
    return headerRow + bodyRows + subtotalRow;
  }).join('');

  const totaisRow = `<tr style="background:#fff3e0;font-weight:700;border-top:2px solid #e07b00">
    <td colspan="6" style="text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#6b7280">TOTAIS GERAIS (${f.length} registro${f.length!==1?'s':''})</td>
    <td style="text-align:center;font-weight:700;font-size:16px;color:#e07b00">${sumQtd}</td>
    <td style="font-weight:700;color:#0f766e">R$ ${fmtNum(sumValor)}</td>
    <td style="color:#dc2626;font-weight:700">${sumDesc > 0 ? 'R$ '+fmtNum(sumDesc) : '-'}</td>
    <td style="font-weight:700;color:#15803d">R$ ${fmtNum(sumLiquido)}</td>
    <td style="color:#1d4ed8;font-weight:700">${sumFrete > 0 ? 'R$ '+fmtNum(sumFrete) : '-'}</td>
    <td colspan="3"></td>
  </tr>`;

  const geradoEm = new Date().toLocaleString('pt-BR');

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
  <title>Registro de Cargas — Grupo Bertoni</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;600;700&display=swap');
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'DM Sans',sans-serif;background:#f0f2f7;color:#1a1f36;padding:24px;}
    .report-wrap{max-width:1200px;margin:0 auto;background:#fff;border-radius:16px;padding:28px 32px;box-shadow:0 4px 24px rgba(0,0,0,.10);}
    .report-header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:22px;padding-bottom:16px;border-bottom:2px solid #e07b00;}
    .report-logo{font-family:'Bebas Neue',sans-serif;font-size:28px;letter-spacing:2px;color:#e07b00;}
    .report-logo span{color:#1a1f36;font-size:14px;letter-spacing:1px;display:block;font-family:'DM Sans',sans-serif;font-weight:600;margin-top:2px;}
    .report-meta{text-align:right;font-size:11px;color:#6b7280;}
    .report-meta strong{color:#1a1f36;}
    .filtros-box{display:flex;flex-wrap:wrap;gap:16px;margin-bottom:18px;padding:12px 16px;background:#f7f8fc;border:1px solid #dde1ec;border-radius:10px;}
    .f-item{display:flex;flex-direction:column;gap:2px;}
    .f-lbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#6b7280;}
    .f-val{font-size:13px;font-weight:700;color:#1a1f36;}
    .summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px;}
    .sum-box{background:#f7f8fc;border:1px solid #dde1ec;border-radius:10px;padding:12px 14px;}
    .sum-lbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#6b7280;margin-bottom:4px;}
    .sum-val{font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:.5px;}
    .sum-val.teal{color:#0f766e;} .sum-val.green{color:#15803d;} .sum-val.orange{color:#e07b00;}
    .sum-val.blue{color:#1d4ed8;} .sum-val.red{color:#dc2626;}
    table{width:100%;border-collapse:collapse;font-size:12px;}
    th{background:#f0f2f7;padding:8px 7px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#6b7280;border:1px solid #dde1ec;text-align:left;white-space:nowrap;}
    td{padding:8px 7px;border:1px solid #dde1ec;vertical-align:middle;background:#fff;}
    tr:nth-child(even) td{background:#f7f8fc;}
    .empresa-group-header td{background:#1a1f36 !important;color:#fff;font-weight:700;font-size:11px;padding:7px 9px;letter-spacing:.4px;border-color:#1a1f36;}
    .empresa-subtotal td{background:#fff3e0 !important;border-top:1.5px solid #e07b00;}
    .footer{margin-top:28px;text-align:center;font-size:11px;color:#6b7280;border-top:1px solid #dde1ec;padding-top:12px;}
    .no-print{margin-top:20px;text-align:center;}
    @media print{
      body{background:#fff;padding:0;}
      .report-wrap{box-shadow:none;padding:0;}
      .no-print{display:none;}
    }
  </style>
  </head><body>
  <div class="report-wrap">
    <div class="report-header">
      <div>
        <div class="report-logo">🔥 Grupo Bertoni <span>Registro de Cargas</span></div>
      </div>
      <div class="report-meta">
        <div>Gerado em: <strong>${geradoEm}</strong></div>
        <div style="margin-top:4px">Total de registros: <strong>${f.length}</strong></div>
      </div>
    </div>

    <div class="filtros-box">
      <div class="f-item"><div class="f-lbl">Empresa</div><div class="f-val">${empresaLabel}</div></div>
      <div class="f-item"><div class="f-lbl">Produto</div><div class="f-val">${prodLabel}</div></div>
      <div class="f-item"><div class="f-lbl">Status</div><div class="f-val">${statusLabel}</div></div>
      <div class="f-item"><div class="f-lbl">Mês</div><div class="f-val">${mesLabel}</div></div>
    </div>

    <div class="summary-grid">
      <div class="sum-box"><div class="sum-lbl">🚛 Total Cargas</div><div class="sum-val orange">${f.length}</div></div>
      <div class="sum-box"><div class="sum-lbl">📦 Total Qtd Botijões</div><div class="sum-val orange">${sumQtd}</div></div>
      <div class="sum-box"><div class="sum-lbl">💰 Valor Total</div><div class="sum-val teal" style="font-size:15px">R$ ${fmtNum(sumValor)}</div></div>
      <div class="sum-box"><div class="sum-lbl">🏷️ Total Descontos</div><div class="sum-val" style="color:#7c3aed;font-size:15px">R$ ${fmtNum(sumDesc)}</div></div>
      <div class="sum-box"><div class="sum-lbl">✅ Total Pago</div><div class="sum-val green" style="font-size:15px">R$ ${fmtNum(totalPago)}</div></div>
      <div class="sum-box"><div class="sum-lbl">🔄 Trocas</div><div class="sum-val orange" style="font-size:15px">${totalTrocaQtdPDF} <span style="font-size:10px;font-weight:600">(${cargasTrocaPDF.length})</span></div></div>
      <div class="sum-box"><div class="sum-lbl">Peso Lançado</div><div class="sum-val orange" style="font-size:15px;font-weight:700">${pdfTonDisplay}</div></div>
      <div class="sum-box"><div class="sum-lbl">🚚 Total Frete</div><div class="sum-val blue" style="font-size:15px">R$ ${fmtNum(sumFrete)}</div></div>
    </div>

    <div style="font-family:'Bebas Neue',sans-serif;font-size:16px;letter-spacing:1px;color:#e07b00;margin-bottom:10px;display:flex;align-items:center;gap:8px;">
      📋 Detalhamento
      <div style="flex:1;height:1px;background:#dde1ec;margin-left:8px;"></div>
    </div>
    <table>
      <thead><tr>
        <th>Data</th><th>Produto</th><th>NF</th><th>Empresa</th><th>Transportadora</th>
        <th>Caminhão</th><th>Qtd</th><th>Valor Carga</th><th>Desconto</th>
        <th>Líquido</th><th>Frete</th><th>Vencimento</th><th>Status</th><th>Obs</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>${totaisRow}</tfoot>
    </table>

    <div class="footer"><strong style="color:#374151">Registro de Cargas — Grupo Bertoni</strong> — Desenvolvido por <strong style="color:#374151">Leandro Machado</strong></div>
    <div class="no-print" style="margin-top:20px;text-align:center">
      <button onclick="window.print()" style="background:#e07b00;color:#fff;border:none;padding:10px 28px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;margin-right:10px">🖨️ Imprimir / Salvar PDF</button>
      <button onclick="window.close()" style="background:#f0f2f7;color:#374151;border:1px solid #dde1ec;padding:10px 28px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">✕ Fechar</button>
    </div>
  </div>
  
<script>
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      console.log('[PWA] Service Worker registrado:', reg.scope);
      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing;
        newSW.addEventListener('statechange', () => {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            const toast = document.createElement('div');
            toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1a1f36;color:#fff;padding:12px 24px;border-radius:10px;font-family:DM Sans,sans-serif;font-size:13px;font-weight:600;z-index:9999;display:flex;align-items:center;gap:12px;box-shadow:0 4px 20px rgba(0,0,0,.3);';
            toast.innerHTML = '🔄 Nova versão disponível! <button onclick="location.reload()" style="background:#e07b00;color:#fff;border:none;padding:5px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;">Atualizar</button>';
            document.body.appendChild(toast);
          }
        });
      });
    } catch (err) {
      console.warn('[PWA] Service Worker não registrado:', err);
    }
  });

  function atualizarStatusOnline() {
    const online = navigator.onLine;
    let badge = document.getElementById('pwa-online-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'pwa-online-badge';
      badge.style.cssText = 'position:fixed;top:8px;right:8px;padding:4px 10px;border-radius:20px;font-family:DM Sans,sans-serif;font-size:10px;font-weight:700;z-index:9998;transition:all .3s;letter-spacing:.4px;';
      document.body.appendChild(badge);
    }
    if (online) {
      badge.style.display = 'none';
    } else {
      badge.style.display = 'block';
      badge.style.background = '#fef2f2';
      badge.style.color = '#dc2626';
      badge.style.border = '1.5px solid #fca5a5';
      badge.textContent = '⚡ Offline — dados em cache';
    }
  }
  window.addEventListener('online',  atualizarStatusOnline);
  window.addEventListener('offline', atualizarStatusOnline);
  atualizarStatusOnline();
}
<\/script>

</body></html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, '_blank');
  if (!win) { showToast('⚠ Permita pop-ups para exportar!'); return; }
  showToast('📄 Relatório de cargas gerado!');
}

async function exportarPDF(){
  const pr=document.getElementById('rFiltPr').value;
  const marca=document.getElementById('rFiltMarca').value;
  const mesVal=document.getElementById('rFiltMes').value;
  const diaVal=document.getElementById('rFiltDia')?.value||'';

  let f=[...lancamentos];
  if(pr)     f=f.filter(l=>l.pr===pr);
  if(marca)  f=f.filter(l=>l.marca===marca);
  if(diaVal) f=f.filter(l=>l.data===diaVal);
  else if(mesVal) f=f.filter(l=>l.data.startsWith(mesVal));

  if(!f.length){showToast('\u26a0 Nenhum dado para exportar!');return;}

  let fiadoPagsFiltrados = [];
  if (!marca) {
    const _todosFiadoPags = await _loadFiadoPag();
    fiadoPagsFiltrados = _todosFiadoPags.filter(p => p.tipo !== 'sobra' && p.tipo !== 'falta_fiado' && p.formasPag);
    if (pr)         fiadoPagsFiltrados = fiadoPagsFiltrados.filter(p => p.pr === pr);
    if (diaVal)      fiadoPagsFiltrados = fiadoPagsFiltrados.filter(p => p.data === diaVal);
    else if (mesVal) fiadoPagsFiltrados = fiadoPagsFiltrados.filter(p => p.data && p.data.startsWith(mesVal));
  }

  let periodoLabel='Todos os meses';
  if(diaVal){const[y,mo,d]=diaVal.split('-');periodoLabel=`${d}/${mo}/${y}`;}
  else if(mesVal){const[y,mo]=mesVal.split('-');periodoLabel=`${MESES_PT[parseInt(mo,10)-1]} ${y}`;}
  const prLabel=pr||'Todos os PRs';
  const marcaLabel=marca||'Todas as marcas';

  const totalQtd=f.reduce((a,b)=>a+b.qtd,0);
  const totalVal=f.reduce((a,b)=>a+b.total,0);
  const qtdUltra=f.filter(l=>l.marca==='Ultragaz').reduce((a,b)=>a+b.qtd,0);
  const valUltra=f.filter(l=>l.marca==='Ultragaz').reduce((a,b)=>a+b.total,0);
  const qtdButano=f.filter(l=>l.marca==='Butano').reduce((a,b)=>a+b.qtd,0);
  const valButano=f.filter(l=>l.marca==='Butano').reduce((a,b)=>a+b.total,0);

  const grupos={};
  f.forEach(l=>{
    const key=l.pr;
    if(!grupos[key]) grupos[key]={pr:l.pr,itens:[]};
    grupos[key].itens.push(l);
  });
  const gruposArr=Object.values(grupos).sort((a,b)=>a.pr.localeCompare(b.pr));

  function somarPag(lista){
    const vistos=new Set(); const soma={};
    PAY_FIELDS.forEach(p=>soma[p]=0);
    lista.forEach(l=>{
      const vid=l.vendaId!=null?l.vendaId:l.id;
      if(!vistos.has(vid)){vistos.add(vid);PAY_FIELDS.forEach(p=>soma[p]+=(l.pag&&l.pag[p]||0));}
    });
    return soma;
  }

  const nCols=4+PAY_FIELDS.length+1;

  function linhaGrupo(g,marcaNome){
    const itensMarca=g.itens.filter(l=>l.marca===marcaNome);
    if(!itensMarca.length) return '';
    const qtdT=itensMarca.reduce((a,l)=>a+l.qtd,0);
    const valT=itensMarca.reduce((a,l)=>a+l.total,0);
    const pag=somarPag(itensMarca);
    const totPago=PAY_FIELDS.reduce((a,p)=>a+pag[p],0);
    return `<tr>
      <td style="font-weight:700">${g.pr}</td>
      <td style="text-align:center;font-family:'Bebas Neue',sans-serif;font-size:16px">${qtdT}</td>
      <td style="text-align:center;color:#6b7280">${periodoLabel}</td>
      <td style="text-align:right;font-weight:700;color:#16a34a">R$ ${fmtNum(valT)}</td>
      ${PAY_FIELDS.map(p=>`<td style="text-align:right;color:${p==='Fiado'?'#dc2626':'#6b7280'}">${pag[p]>0?'R$ '+fmtNum(pag[p]):'-'}</td>`).join('')}
      <td style="text-align:right;font-weight:700">${totPago>0?'R$ '+fmtNum(totPago):'-'}</td>
    </tr>`;
  }

  function blocoMarca(marcaNome,corHeader,corBg){
    const gs=gruposArr.filter(g=>g.itens.some(l=>l.marca===marcaNome));
    if(!gs.length) return '';
    const itensMarca=f.filter(l=>l.marca===marcaNome);
    const qtdM=itensMarca.reduce((a,l)=>a+l.qtd,0);
    const valM=itensMarca.reduce((a,l)=>a+l.total,0);
    const pagM=somarPag(itensMarca);
    const totPagoM=PAY_FIELDS.reduce((a,p)=>a+pagM[p],0);
    const linhas=gs.map(g=>linhaGrupo(g,marcaNome)).join('');
    const subtotal=`<tr style="background:${corBg};font-weight:700;border-top:2px solid ${corHeader}">
      <td style="font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:${corHeader}">Subtotal ${marcaNome}</td>
      <td style="text-align:center;color:${corHeader}">${qtdM}</td>
      <td></td>
      <td style="text-align:right;color:${corHeader}">R$ ${fmtNum(valM)}</td>
      ${PAY_FIELDS.map(p=>`<td style="text-align:right;color:${p==='Fiado'?'#dc2626':corHeader}">${pagM[p]>0?'R$ '+fmtNum(pagM[p]):'-'}</td>`).join('')}
      <td style="text-align:right;color:${corHeader}">R$ ${fmtNum(totPagoM)}</td>
    </tr>`;
    return `<tr><td colspan="${nCols}" style="padding:10px 8px 4px;font-family:'Bebas Neue',sans-serif;font-size:13px;letter-spacing:.8px;color:${corHeader};background:${corBg};border-top:2px solid ${corHeader}">
      ${marcaNome==='Ultragaz'?'🔵':'🟢'} ${marcaNome.toUpperCase()}
    </td></tr>${linhas}${subtotal}`;
  }

  const pagGeral=somarPag(f);
  fiadoPagsFiltrados.forEach(pg=>{
    Object.keys(FP_TO_PAY).forEach(fpKey=>{
      const v=(pg.formasPag && pg.formasPag[fpKey])||0;
      if(v>0) pagGeral[FP_TO_PAY[fpKey]] = (pagGeral[FP_TO_PAY[fpKey]]||0) + v;
    });
  });
  const totPagoGeral=PAY_FIELDS.reduce((a,p)=>a+pagGeral[p],0);
  const totalGeralRow=`<tr style="background:#fff3e0;font-weight:700;border-top:3px solid #e07b00">
    <td style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#e07b00">TOTAL GERAL</td>
    <td style="text-align:center;color:#e07b00">${totalQtd}</td>
    <td></td>
    <td style="text-align:right;color:#e07b00">R$ ${fmtNum(totalVal)}</td>
    ${PAY_FIELDS.map(p=>`<td style="text-align:right;color:${p==='Fiado'?'#dc2626':'#e07b00'}">${pagGeral[p]>0?'R$ '+fmtNum(pagGeral[p]):'-'}</td>`).join('')}
    <td style="text-align:right;color:#e07b00">R$ ${fmtNum(totPagoGeral)}</td>
  </tr>`;

  const html=`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
  <title>Relat\u00f3rio PR \u2013 ${periodoLabel}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;600;700&display=swap');
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'DM Sans',sans-serif;color:#1a1f36;background:#fff;padding:24px;font-size:11px;}
    .report-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:14px;border-bottom:2px solid #e07b00;}
    .logo{font-family:'Bebas Neue',sans-serif;font-size:28px;letter-spacing:2px;color:#e07b00;}
    .logo span{color:#1a1f36;}
    .report-meta{text-align:right;font-size:11px;color:#6b7280;}
    .report-title{font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:1px;color:#1a1f36;margin-bottom:4px;}
    .filtros{display:flex;gap:12px;font-size:11px;color:#6b7280;margin-bottom:16px;flex-wrap:wrap;}
    .filtro-item{background:#f7f8fc;border:1px solid #dde1ec;border-radius:6px;padding:4px 10px;}
    .filtro-label{font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-right:4px;color:#1a1f36;}
    .summary-row{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:16px;}
    .sum-box{background:#f7f8fc;border:1px solid #dde1ec;border-radius:8px;padding:8px 10px;text-align:center;}
    .sum-lbl{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#6b7280;margin-bottom:3px;}
    .sum-val{font-family:'Bebas Neue',sans-serif;font-size:20px;color:#e07b00;}
    table{width:100%;border-collapse:collapse;font-size:10px;}
    thead{background:#1a1f36;}
    th{padding:6px 7px;text-align:left;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#fff;white-space:nowrap;}
    th:not(:first-child){text-align:right;}
    td{padding:5px 7px;border-bottom:1px solid #f0f2f7;vertical-align:middle;}
    .section-title{font-family:'Bebas Neue',sans-serif;font-size:14px;letter-spacing:1px;color:#e07b00;margin:14px 0 6px;border-bottom:1px solid #dde1ec;padding-bottom:3px;}
    .footer{margin-top:20px;text-align:center;font-size:10px;color:#9ca3af;border-top:1px solid #dde1ec;padding-top:10px;}
    @media print{body{padding:8px;} .no-print{display:none;}}
  </style></head><body>
  <div class="report-header">
    <div>
      <div class="logo">\uD83D\uDD25 Grupo Bertoni <span>Controle PR Morato</span></div>
      <div class="report-title">Relat\u00f3rio de Vendas PR</div>
    </div>
    <div class="report-meta">
      <div>Gerado em: ${new Date().toLocaleDateString('pt-BR')} \u00e0s ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</div>
      <div style="margin-top:4px">${gruposArr.length} grupo(s) \u00b7 ${f.length} lan\u00e7amento(s)</div>
    </div>
  </div>
  <div class="filtros">
    <div class="filtro-item"><span class="filtro-label">${diaVal?'Dia':'Per\u00edodo'}:</span>${periodoLabel}</div>
    <div class="filtro-item"><span class="filtro-label">PR:</span>${prLabel}</div>
    <div class="filtro-item"><span class="filtro-label">Marca:</span>${marcaLabel}</div>
  </div>
  <div class="summary-row">
    <div class="sum-box"><div class="sum-lbl">Total Bot.</div><div class="sum-val">${totalQtd}</div></div>
    <div class="sum-box"><div class="sum-lbl">Valor Total</div><div class="sum-val" style="color:#16a34a;font-size:14px">R$ ${fmtNum(totalVal)}</div></div>
    <div class="sum-box"><div class="sum-lbl">Ultragaz Qtd</div><div class="sum-val" style="color:#1d4ed8">${qtdUltra}</div></div>
    <div class="sum-box"><div class="sum-lbl">Ultragaz Valor</div><div class="sum-val" style="color:#1d4ed8;font-size:13px">R$ ${fmtNum(valUltra)}</div></div>
    <div class="sum-box"><div class="sum-lbl">Butano Qtd</div><div class="sum-val" style="color:#15803d">${qtdButano}</div></div>
    <div class="sum-box"><div class="sum-lbl">Butano Valor</div><div class="sum-val" style="color:#15803d;font-size:13px">R$ ${fmtNum(valButano)}</div></div>
  </div>
  <div class="section-title">\uD83D\uDCCB Detalhamento por Marca</div>
  <table>
    <thead><tr>
      <th>PR</th><th style="text-align:center">Qtd</th><th style="text-align:center">Período</th><th>Total Venda</th>
      ${PAY_FIELDS.map(p=>`<th>${p}</th>`).join('')}<th>Total Pago</th>
    </tr></thead>
    <tbody>
      ${blocoMarca('Ultragaz','#1d4ed8','#eff6ff')}
      ${blocoMarca('Butano','#15803d','#f0fdf4')}
      ${totalGeralRow}
    </tbody>
  </table>
  ${fiadoPagsFiltrados.length ? `<div style="font-size:9px;color:#6b7280;margin-top:6px;">* O TOTAL GERAL inclui pagamentos de fiado quitados posteriormente na aba 📒 Fiado (R$ ${fmtNum(fiadoPagsFiltrados.reduce((a,p)=>a+p.valor,0))}), não atribuídos a uma marca específica.</div>` : ''}
  <div class="footer"><strong style="color:#374151">Sistema Controle de PR</strong> \u2014 Desenvolvido por <strong style="color:#374151">Leandro Machado</strong></div>
  <div class="no-print" style="margin-top:20px;text-align:center">
    <button onclick="window.print()" style="background:#e07b00;color:#fff;border:none;padding:10px 28px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;margin-right:10px">\uD83D\uDDA8\uFE0F Imprimir / Salvar PDF</button>
    <button onclick="window.close()" style="background:#f0f2f7;color:#374151;border:1px solid #dde1ec;padding:10px 28px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">\u2715 Fechar</button>
  </div>
  </body></html>`;

  const blob=new Blob([html],{type:'text/html'});
  const url=URL.createObjectURL(blob);
  const win=window.open(url,'_blank');
  if(!win){showToast('\u26a0 Permita pop-ups para exportar!');return;}
  showToast('\uD83D\uDCC4 Relat\u00f3rio gerado!');
}

// ══════════════════════════════════════════════
//  BACKUP — funções de UI
// ══════════════════════════════════════════════
async function abrirBackupModal() {
  document.getElementById('backupModal').style.display = 'flex';
  await carregarInfoBackup();
}

function fecharBackupModal() {
  document.getElementById('backupModal').style.display = 'none';
}

async function carregarInfoBackup() {
  try {
    const meta = await window._fbGetDoc('config', 'backup_meta');
    const el = document.getElementById('backupMetaInfo');
    if (meta) {
      const [y,m,d] = meta.ultimo.split('-');
      const hoje = hojeLocal();
      const diff = Math.floor((new Date(hoje) - new Date(meta.ultimo)) / 86400000);
      const proximo = 10 - diff;
      el.innerHTML = `
        <div style="display:flex;gap:20px;flex-wrap:wrap;">
          <div><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);margin-bottom:3px">Último backup</div>
            <div style="font-size:15px;font-weight:700;color:var(--text)">${d}/${m}/${y}</div></div>
          <div><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);margin-bottom:3px">Lançamentos</div>
            <div style="font-size:15px;font-weight:700;color:var(--ultra)">${meta.total_lancamentos || '—'}</div></div>
          <div><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);margin-bottom:3px">Cargas</div>
            <div style="font-size:15px;font-weight:700;color:var(--butano)">${meta.total_cargas || '—'}</div></div>
          <div><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);margin-bottom:3px">Próximo automático</div>
            <div style="font-size:15px;font-weight:700;color:${proximo<=2?'var(--success)':'var(--accent)'}">em ${proximo > 0 ? proximo : 0} dia(s)</div></div>
        </div>`;
    } else {
      el.innerHTML = '<span style="color:var(--muted2)">Nenhum backup encontrado ainda.</span>';
    }
  } catch(e) { console.error(e); }

  try {
    const backups = await window._fbGetBackups();
    const list = document.getElementById('backupList');
    if (!backups.length) {
      list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted2);font-size:12px;">Nenhum backup ainda.</div>';
      return;
    }
    list.innerHTML = backups.map(b => {
      const [y,m,d] = (b.data||'').split('-');
      const ts = b.criadoEm ? new Date(b.criadoEm).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '--:--';
      return `
        <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;flex-wrap:wrap;">
          <div style="font-size:20px;flex-shrink:0;">🗄️</div>
          <div style="flex:1;min-width:140px;">
            <div style="font-weight:700;font-size:13px;color:var(--text)">${d||'??'}/${m||'??'}/${y||'??'} <span style="font-size:10px;color:var(--muted);font-weight:400">às ${ts}</span></div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px">${b.lancamentos?.length||0} lançamentos · ${b.cargas?.length||0} cargas</div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0;">
            <button onclick="window._restaurarBackup('${b.data}')" title="Restaurar este backup"
              style="background:#dcfce7;color:var(--success);border:1.5px solid #bbf7d0;padding:5px 10px;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;">
              ♻️ Restaurar
            </button>
            <button onclick="baixarBackup('${b.data}')" title="Baixar como JSON"
              style="background:var(--ultra-light);color:var(--ultra);border:1.5px solid #bfdbfe;padding:5px 10px;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;">
              ⬇️ JSON
            </button>
          </div>
        </div>`;
    }).join('');
  } catch(e) { console.error(e); }
}

async function fazerBackupManual() {
  const btn = document.getElementById('btnBackupManual');
  btn.textContent = '⏳ Salvando...';
  btn.disabled = true;
  try {
    const hoje = hojeLocal();
    const label = hoje + '_' + new Date().toTimeString().slice(0,5).replace(':','-');
    await window._executarBackup(label);
    showToast('✅ Backup manual criado!');
    await carregarInfoBackup();
  } catch(e) {
    showToast('⚠ Erro ao criar backup!');
    console.error(e);
  }
  btn.textContent = '💾 Fazer Backup Agora';
  btn.disabled = false;
}

async function importarBackupJSON(file) {
  if (!file) return;
  const msgEl = document.getElementById('importarBackupMsg');
  const btn   = document.getElementById('btnImportarBackup');
  const inputEl = document.getElementById('inputImportarBackup');
  msgEl.style.color = 'var(--muted)';
  msgEl.textContent = '⏳ Lendo arquivo...';
  try {
    const text = await file.text();
    const json = JSON.parse(text);

    const lancs  = json.lancamentos || (json.data && json.data.lancamentos) || [];
    const cargas = json.cargas      || (json.data && json.data.cargas)      || [];
    const cfg    = json.config      || (json.data && json.data.config)      || {};
    const prs    = json.prs || json.prsSupabase || (cfg.prs && cfg.prs.lista) || null;
    const fiadosNovo = json.fiados || (json.data && json.data.fiados) || [];
    const fiadoLegado = json.fiadoPagamentos || json.fiado_pagamentos || null;

    if (!lancs.length && !cargas.length && !fiadosNovo.length) {
      throw new Error('Arquivo não contém lançamentos, cargas nem fiados reconhecíveis.');
    }

    if (!confirm(`Importar backup?\n\n📦 ${lancs.length} lançamentos\n🚛 ${cargas.length} cargas\n💰 ${fiadosNovo.length} fiados\n\nIsso vai GRAVAR esses dados no Supabase (itens com o mesmo id são sobrescritos).`)) {
      msgEl.textContent = '';
      return;
    }

    btn.disabled = true;
    msgEl.textContent = '⏳ Importando...';

    if (lancs.length)      await window._saveLancamentosDocs(lancs);
    if (cargas.length)     await window._saveCargasDocs(cargas);
    if (fiadosNovo.length) await window._fbSaveCollection('fiados', fiadosNovo, f => f.id || f._fbId);
    if (cfg.precos)        await window._fbSetDoc('config', 'precos', cfg.precos);
    if (cfg.frete)         await window._fbSetDoc('config', 'frete', cfg.frete);
    if (cfg.empresa_dias)  await window._fbSetDoc('config', 'empresa_dias', cfg.empresa_dias);
    if (cfg.estoque_inicial) await window._fbSetDoc('config', 'estoque_inicial', cfg.estoque_inicial);
    if (prs)               await window._savePRs(prs);
    if (fiadoLegado)       await window._fbSetDoc('config', 'fiado_pagamentos', { lista: fiadoLegado });

    msgEl.style.color = 'var(--success)';
    msgEl.textContent = `✅ Importado! ${lancs.length} lançamentos, ${cargas.length} cargas, ${fiadosNovo.length} fiados.`;
    showToast('✅ Backup importado! Recarregando...');
    setTimeout(() => location.reload(), 1500);
  } catch(e) {
    console.error('Erro ao importar backup:', e);
    msgEl.style.color = '#dc2626';
    msgEl.textContent = '❌ Erro: ' + e.message;
  } finally {
    btn.disabled = false;
    if (inputEl) inputEl.value = '';
  }
}

async function baixarBackup(dataLabel) {
  try {
    const backups = await window._fbGetBackups();
    const backup = backups.find(b => b.data === dataLabel || b.data.startsWith(dataLabel));
    if (!backup) { showToast('⚠ Backup não encontrado!'); return; }
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `backup_gas_${dataLabel}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('⬇️ Download iniciado!');
  } catch(e) { showToast('⚠ Erro ao baixar backup!'); console.error(e); }
}

// ══════════════════════════════════════════════
//  MARGEM — lógica completa
// ══════════════════════════════════════════════
let chartMargemInst = null;

function buildMargemMesOptions() {
  const sel = document.getElementById('mFiltMes');
  if (!sel) return;
  const meses = new Set(lancamentos.map(l => l.data.slice(0,7)));
  const sorted = [...meses].sort().reverse();
  const cur = sel.value;
  sel.innerHTML = '<option value="">Todos os meses</option>';
  sorted.forEach(m => {
    const [y, mo] = m.split('-');
    const o = document.createElement('option');
    o.value = m;
    o.textContent = `${MESES_PT[parseInt(mo,10)-1]} ${y}`;
    if (m === cur) o.selected = true;
    sel.appendChild(o);
  });
}

function populateMargemFiltPr() {
  const sel = document.getElementById('mFiltPr');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">Todos os PRs</option>';
  [...PRS].sort().forEach(p => {
    const o = document.createElement('option');
    o.value = p; o.textContent = p;
    sel.appendChild(o);
  });
  if (cur) sel.value = cur;
}

function limparFiltrosMargem() {
  const ini = document.getElementById('mFiltDataIni');
  const fim = document.getElementById('mFiltDataFim');
  const mes = document.getElementById('mFiltMes');
  if (ini) ini.value = '';
  if (fim) fim.value = '';
  if (mes) mes.value = '';
  renderMargem();
}

function exportarPDFMargem() {
  const mes     = document.getElementById('mFiltMes')?.value || '';
  const dataIni = document.getElementById('mFiltDataIni')?.value || '';
  const dataFim = document.getElementById('mFiltDataFim')?.value || '';
  const prFilt  = document.getElementById('mFiltPr')?.value || '';
  const custoU  = parseFloat(document.getElementById('mCustoUltra')?.value) || 0;
  const custoB  = parseFloat(document.getElementById('mCustoButano')?.value) || 0;

  if (custoU === 0 && custoB === 0) {
    showToast('⚠ Informe o custo de pelo menos uma marca!');
    return;
  }

  let f = [...lancamentos];
  if (dataIni || dataFim) {
    if (dataIni) f = f.filter(l => l.data >= dataIni);
    if (dataFim) f = f.filter(l => l.data <= dataFim);
  } else if (mes) {
    f = f.filter(l => l.data.startsWith(mes));
  }
  if (prFilt) f = f.filter(l => l.pr === prFilt);

  if (!f.length) { showToast('⚠ Nenhum dado para exportar!'); return; }

  const prsAtivos = [...new Set(f.map(l => l.pr))].sort();

  const dados = prsAtivos.map(pr => {
    const itens = f.filter(l => l.pr === pr);
    const ultraItens  = itens.filter(l => l.marca === 'Ultragaz');
    const butanoItens = itens.filter(l => l.marca === 'Butano');

    const qtdU = ultraItens.reduce((a,b) => a + b.qtd,   0);
    const valU = ultraItens.reduce((a,b) => a + b.total, 0);
    const qtdB = butanoItens.reduce((a,b) => a + b.qtd,   0);
    const valB = butanoItens.reduce((a,b) => a + b.total, 0);

    const pmU = qtdU > 0 ? valU / qtdU : 0;
    const pmB = qtdB > 0 ? valB / qtdB : 0;

    const mUnitU = custoU > 0 ? pmU - custoU : 0;
    const mUnitB = custoB > 0 ? pmB - custoB : 0;
    const mTotU  = mUnitU * qtdU;
    const mTotB  = mUnitB * qtdB;
    const mTotal = mTotU + mTotB;
    const totalVenda = valU + valB;
    const pctMargem = totalVenda > 0 ? (mTotal / totalVenda) * 100 : 0;
    const totalQtd = qtdU + qtdB;

    return { pr, qtdU, valU, pmU, mUnitU, mTotU, qtdB, valB, pmB, mUnitB, mTotB, mTotal, totalVenda, pctMargem, totalQtd };
  }).sort((a,b) => b.mTotal - a.mTotal);

  let periodoLabel = 'Todos os lançamentos';
  if (dataIni || dataFim) {
    const ini = dataIni ? fmtDate(dataIni) : '—';
    const fim = dataFim ? fmtDate(dataFim) : '—';
    periodoLabel = `${ini} até ${fim}`;
  } else if (mes) {
    const [y, mo] = mes.split('-');
    periodoLabel = `${MESES_PT[parseInt(mo,10)-1]} ${y}`;
  }
  const prLabel = prFilt || 'Todos os PRs';

  const totalMargem   = dados.reduce((a,b) => a + b.mTotal, 0);
  const totalBotijoes = dados.reduce((a,b) => a + b.totalQtd, 0);
  const totalVendasG  = dados.reduce((a,b) => a + b.totalVenda, 0);
  const margemMedia   = totalVendasG > 0 ? (totalMargem / totalVendasG) * 100 : 0;
  const melhorPR      = dados.length ? dados[0] : null;

  const totQtdU  = dados.reduce((a,b) => a + b.qtdU, 0);
  const totQtdB  = dados.reduce((a,b) => a + b.qtdB, 0);
  const totMTotU = dados.reduce((a,b) => a + b.mTotU, 0);
  const totMTotB = dados.reduce((a,b) => a + b.mTotB, 0);

  const fmtSinal = v => (v >= 0 ? '' : '-') + 'R$ ' + fmtNum(Math.abs(v));
  const corVal = v => v >= 0 ? '#15803d' : '#dc2626';

  const rows = dados.map((d, i) => {
    const medalha = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
    return `<tr>
      <td style="font-weight:700">${medalha} ${d.pr}</td>
      <td style="text-align:center;font-weight:700;color:#1d4ed8">${d.qtdU || '-'}</td>
      <td style="text-align:right;color:#1d4ed8">${d.qtdU>0?'R$ '+fmtNum(d.pmU):'-'}</td>
      <td style="text-align:right;color:${custoU>0&&d.qtdU>0?corVal(d.mUnitU):'#9ca3af'}">${custoU>0&&d.qtdU>0?fmtSinal(d.mUnitU):'-'}</td>
      <td style="text-align:right;font-weight:700;color:${custoU>0&&d.qtdU>0?corVal(d.mTotU):'#9ca3af'}">${custoU>0&&d.qtdU>0?fmtSinal(d.mTotU):'-'}</td>
      <td style="text-align:center;font-weight:700;color:#15803d">${d.qtdB || '-'}</td>
      <td style="text-align:right;color:#15803d">${d.qtdB>0?'R$ '+fmtNum(d.pmB):'-'}</td>
      <td style="text-align:right;color:${custoB>0&&d.qtdB>0?corVal(d.mUnitB):'#9ca3af'}">${custoB>0&&d.qtdB>0?fmtSinal(d.mUnitB):'-'}</td>
      <td style="text-align:right;font-weight:700;color:${custoB>0&&d.qtdB>0?corVal(d.mTotB):'#9ca3af'}">${custoB>0&&d.qtdB>0?fmtSinal(d.mTotB):'-'}</td>
      <td style="text-align:center;font-weight:700">${d.totalQtd}</td>
      <td style="text-align:right;font-weight:700;color:${corVal(d.mTotal)}">${fmtSinal(d.mTotal)}</td>
      <td style="text-align:right;font-weight:700;color:${corVal(d.pctMargem)}">${d.pctMargem.toFixed(1).replace('.',',')}%</td>
    </tr>`;
  }).join('');

  const totaisRow = `<tr style="background:#fff3e0;font-weight:700;border-top:2px solid #e07b00">
    <td style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#e07b00">TOTAL GERAL</td>
    <td style="text-align:center;color:#1d4ed8">${totQtdU || '-'}</td>
    <td></td><td></td>
    <td style="text-align:right;color:${corVal(totMTotU)}">${custoU>0?fmtSinal(totMTotU):'-'}</td>
    <td style="text-align:center;color:#15803d">${totQtdB || '-'}</td>
    <td></td><td></td>
    <td style="text-align:right;color:${corVal(totMTotB)}">${custoB>0?fmtSinal(totMTotB):'-'}</td>
    <td style="text-align:center;color:#e07b00">${totalBotijoes}</td>
    <td style="text-align:right;color:${corVal(totalMargem)}">${fmtSinal(totalMargem)}</td>
    <td style="text-align:right;color:${corVal(margemMedia)}">${margemMedia.toFixed(1).replace('.',',')}%</td>
  </tr>`;

  const geradoEm = new Date().toLocaleString('pt-BR');

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
  <title>Relatório de Margem por PR — Grupo Bertoni</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;600;700&display=swap');
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'DM Sans',sans-serif;background:#f0f2f7;color:#1a1f36;padding:24px;}
    .report-wrap{max-width:1200px;margin:0 auto;background:#fff;border-radius:16px;padding:28px 32px;box-shadow:0 4px 24px rgba(0,0,0,.10);}
    .report-header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:22px;padding-bottom:16px;border-bottom:2px solid #e07b00;}
    .report-logo{font-family:'Bebas Neue',sans-serif;font-size:28px;letter-spacing:2px;color:#e07b00;}
    .report-logo span{color:#1a1f36;font-size:14px;letter-spacing:1px;display:block;font-family:'DM Sans',sans-serif;font-weight:600;margin-top:2px;}
    .report-meta{text-align:right;font-size:11px;color:#6b7280;}
    .report-meta strong{color:#1a1f36;}
    .filtros-box{display:flex;flex-wrap:wrap;gap:16px;margin-bottom:18px;padding:12px 16px;background:#f7f8fc;border:1px solid #dde1ec;border-radius:10px;}
    .f-item{display:flex;flex-direction:column;gap:2px;}
    .f-lbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#6b7280;}
    .f-val{font-size:13px;font-weight:700;color:#1a1f36;}
    .summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px;}
    .sum-box{background:#f7f8fc;border:1px solid #dde1ec;border-radius:10px;padding:12px 14px;}
    .sum-lbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#6b7280;margin-bottom:4px;}
    .sum-val{font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:.5px;}
    .sum-val.green{color:#15803d;} .sum-val.red{color:#dc2626;} .sum-val.orange{color:#e07b00;}
    .sum-val.blue{color:#1d4ed8;} .sum-val.bgreen{color:#15803d;}
    table{width:100%;border-collapse:collapse;font-size:11px;}
    thead tr:first-child th{background:#1a1f36;color:#fff;padding:8px 7px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;text-align:center;}
    thead tr:last-child th{padding:6px 7px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;text-align:right;border:1px solid #dde1ec;white-space:nowrap;}
    thead tr:last-child th:first-child{text-align:left;background:#f0f2f7;color:#6b7280;}
    th.th-ultra{background:#eff6ff;color:#1d4ed8;}
    th.th-butano{background:#f0fdf4;color:#15803d;}
    td{padding:7px 8px;border:1px solid #dde1ec;vertical-align:middle;background:#fff;}
    tr:nth-child(even) td{background:#f7f8fc;}
    .footer{margin-top:28px;text-align:center;font-size:11px;color:#6b7280;border-top:1px solid #dde1ec;padding-top:12px;}
    .no-print{margin-top:20px;text-align:center;}
    @media print{
      body{background:#fff;padding:0;}
      .report-wrap{box-shadow:none;padding:0;}
      .no-print{display:none;}
    }
  </style>
  </head><body>
  <div class="report-wrap">
    <div class="report-header">
      <div>
        <div class="report-logo">🔥 Grupo Bertoni <span>Análise de Margem por PR</span></div>
      </div>
      <div class="report-meta">
        <div>Gerado em: <strong>${geradoEm}</strong></div>
        <div style="margin-top:4px">PRs no relatório: <strong>${dados.length}</strong></div>
      </div>
    </div>

    <div class="filtros-box">
      <div class="f-item"><div class="f-lbl">Período</div><div class="f-val">${periodoLabel}</div></div>
      <div class="f-item"><div class="f-lbl">PR</div><div class="f-val">${prLabel}</div></div>
      <div class="f-item"><div class="f-lbl">Custo Ultragaz</div><div class="f-val">${custoU>0?fmtVal(custoU)+'/bot':'—'}</div></div>
      <div class="f-item"><div class="f-lbl">Custo Butano</div><div class="f-val">${custoB>0?fmtVal(custoB)+'/bot':'—'}</div></div>
    </div>

    <div class="summary-grid">
      <div class="sum-box"><div class="sum-lbl">💰 Margem Total</div><div class="sum-val ${totalMargem>=0?'green':'red'}">${fmtSinal(totalMargem)}</div></div>
      <div class="sum-box"><div class="sum-lbl">📦 Total Botijões</div><div class="sum-val orange">${totalBotijoes}</div></div>
      <div class="sum-box"><div class="sum-lbl">📊 % Margem Média</div><div class="sum-val ${margemMedia>=0?'green':'red'}">${margemMedia.toFixed(1).replace('.',',')}%</div></div>
      <div class="sum-box"><div class="sum-lbl">🏆 Melhor PR</div><div class="sum-val orange" style="font-size:15px">${melhorPR ? melhorPR.pr : '—'}</div></div>
    </div>

    <div style="font-family:'Bebas Neue',sans-serif;font-size:16px;letter-spacing:1px;color:#e07b00;margin-bottom:10px;display:flex;align-items:center;gap:8px;">
      📈 Margem por PR
      <div style="flex:1;height:1px;background:#dde1ec;margin-left:8px;"></div>
    </div>
    <table>
      <thead>
        <tr>
          <th></th>
          <th class="th-ultra" colspan="4">🔵 Ultragaz</th>
          <th class="th-butano" colspan="4">🟢 Butano</th>
          <th colspan="3"></th>
        </tr>
        <tr>
          <th>PR</th>
          <th class="th-ultra">Qtd</th><th class="th-ultra">P. Médio</th><th class="th-ultra">M. Unit.</th><th class="th-ultra">M. Total</th>
          <th class="th-butano">Qtd</th><th class="th-butano">P. Médio</th><th class="th-butano">M. Unit.</th><th class="th-butano">M. Total</th>
          <th style="text-align:center">Total Bot.</th><th>Margem R$</th><th>% Mg.</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>${totaisRow}</tfoot>
    </table>

    <div class="footer"><strong style="color:#374151">Análise de Margem por PR — Grupo Bertoni</strong> — Desenvolvido por <strong style="color:#374151">Leandro Machado</strong></div>
    <div class="no-print" style="margin-top:20px;text-align:center">
      <button onclick="window.print()" style="background:#e07b00;color:#fff;border:none;padding:10px 28px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;margin-right:10px">🖨️ Imprimir / Salvar PDF</button>
      <button onclick="window.close()" style="background:#f0f2f7;color:#374151;border:1px solid #dde1ec;padding:10px 28px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">✕ Fechar</button>
    </div>
  </div>
  </body></html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, '_blank');
  if (!win) { showToast('⚠ Permita pop-ups para exportar!'); return; }
  showToast('📄 Relatório de margem gerado!');
}

function renderMargem() {
  buildMargemMesOptions();
  populateMargemFiltPr();

  const mes       = document.getElementById('mFiltMes')?.value || '';
  const dataIni   = document.getElementById('mFiltDataIni')?.value || '';
  const dataFim   = document.getElementById('mFiltDataFim')?.value || '';
  const prFilt    = document.getElementById('mFiltPr')?.value || '';
  const custoU    = parseFloat(document.getElementById('mCustoUltra')?.value) || 0;
  const custoB    = parseFloat(document.getElementById('mCustoButano')?.value) || 0;

  let f = [...lancamentos];
  if (dataIni || dataFim) {
    if (dataIni) f = f.filter(l => l.data >= dataIni);
    if (dataFim) f = f.filter(l => l.data <= dataFim);
  } else if (mes) {
    f = f.filter(l => l.data.startsWith(mes));
  }
  if (prFilt)    f = f.filter(l => l.pr === prFilt);

  const prsAtivos = [...new Set(f.map(l => l.pr))].sort();

  const dados = prsAtivos.map(pr => {
    const itens = f.filter(l => l.pr === pr);
    const ultraItens  = itens.filter(l => l.marca === 'Ultragaz');
    const butanoItens = itens.filter(l => l.marca === 'Butano');

    const qtdU  = ultraItens.reduce((a,b) => a + b.qtd,   0);
    const valU  = ultraItens.reduce((a,b) => a + b.total, 0);
    const qtdB  = butanoItens.reduce((a,b) => a + b.qtd,   0);
    const valB  = butanoItens.reduce((a,b) => a + b.total, 0);

    const pmU   = qtdU > 0 ? valU / qtdU : 0;
    const pmB   = qtdB > 0 ? valB / qtdB : 0;

    const mUnitU  = custoU > 0 ? pmU - custoU : 0;
    const mUnitB  = custoB > 0 ? pmB - custoB : 0;
    const mTotU   = mUnitU * qtdU;
    const mTotB   = mUnitB * qtdB;
    const mTotal  = mTotU + mTotB;
    const totalVenda = valU + valB;
    const pctMargem = totalVenda > 0 ? (mTotal / totalVenda) * 100 : 0;
    const totalQtd  = qtdU + qtdB;

    return { pr, qtdU, valU, pmU, mUnitU, mTotU, qtdB, valB, pmB, mUnitB, mTotB, mTotal, totalVenda, pctMargem, totalQtd };
  });

  const totalMargem   = dados.reduce((a,b) => a + b.mTotal, 0);
  const totalBotijoes = dados.reduce((a,b) => a + b.totalQtd, 0);
  const totalVendasG  = dados.reduce((a,b) => a + b.totalVenda, 0);
  const margemMedia   = totalVendasG > 0 ? (totalMargem / totalVendasG) * 100 : 0;
  const melhorPR      = dados.length ? dados.reduce((a,b) => b.mTotal > a.mTotal ? b : a) : null;

  const resumoEl = document.getElementById('margemResumoCards');
  if (custoU === 0 && custoB === 0) {
    resumoEl.innerHTML = `
      <div class="summary-card" style="grid-column:1/-1;text-align:center;color:var(--muted2);font-size:13px;padding:24px;">
        ⬆️ Informe o custo de pelo menos uma marca para visualizar as margens.
      </div>`;
  } else {
    resumoEl.innerHTML = `
      <div class="summary-card"><div class="s-label">💰 Margem Total</div><div class="s-value ${totalMargem>=0?'green':'red'}" style="font-size:20px">${fmtVal(totalMargem)}</div></div>
      <div class="summary-card"><div class="s-label">📦 Total Botijões</div><div class="s-value">${totalBotijoes}</div></div>
      <div class="summary-card"><div class="s-label">📊 % Margem Média</div><div class="s-value ${margemMedia>=0?'green':'red'}" style="font-size:20px">${margemMedia.toFixed(1).replace('.',',')}%</div></div>
      ${melhorPR ? `<div class="summary-card" style="border:1.5px solid #f5c97a;background:linear-gradient(135deg,#fffbf2,#fff4e0)"><div class="s-label">🏆 Melhor PR</div><div style="font-size:15px;font-weight:700;color:var(--accent);margin-top:4px">${melhorPR.pr}</div><div style="font-size:12px;font-weight:700;color:var(--success);margin-top:2px">${fmtVal(melhorPR.mTotal)}</div></div>` : ''}
      ${custoU>0?`<div class="summary-card" style="border:1.5px solid #bfdbfe;background:#eff6ff"><div class="s-label">🔵 Custo Ultra</div><div class="s-value blue" style="font-size:20px">${fmtVal(custoU)}<span style="font-size:11px;color:var(--muted);font-family:'DM Sans',sans-serif;font-weight:500">/bot</span></div></div>`:''}
      ${custoB>0?`<div class="summary-card" style="border:1.5px solid #bbf7d0;background:#f0fdf4"><div class="s-label">🟢 Custo Butano</div><div class="s-value bgreen" style="font-size:20px">${fmtVal(custoB)}<span style="font-size:11px;color:var(--muted);font-family:'DM Sans',sans-serif;font-weight:500">/bot</span></div></div>`:''}
    `;
  }

  const tbody = document.getElementById('tbodyMargem');
  if (!dados.length) {
    tbody.innerHTML = '<tr><td colspan="12" class="empty">Nenhum dado para o filtro selecionado.</td></tr>';
  } else if (custoU === 0 && custoB === 0) {
    tbody.innerHTML = '<tr><td colspan="12" class="empty">Informe o custo de pelo menos uma marca para calcular as margens.</td></tr>';
  } else {
    const sorted = [...dados].sort((a,b) => b.mTotal - a.mTotal);
    tbody.innerHTML = sorted.map((d, i) => {
      const cor = d.mTotal >= 0 ? 'var(--success)' : 'var(--danger)';
      const pctColor = d.pctMargem >= 0 ? 'var(--success)' : 'var(--danger)';
      const medalha = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
      const tdR = 'style="text-align:right;padding:7px 10px;"';
      const tdL = 'style="padding:7px 10px;position:sticky;left:0;background:#fff;z-index:1;font-weight:700;white-space:nowrap;"';
      return `<tr>
        <td ${tdL}>${medalha} ${d.pr}</td>
        <td ${tdR} style="text-align:right;padding:7px 10px;background:#f8faff;font-family:'Bebas Neue',sans-serif;font-size:16px;color:var(--ultra)">${d.qtdU}</td>
        <td ${tdR} style="text-align:right;padding:7px 10px;background:#f8faff;color:var(--ultra)">${d.qtdU>0?fmtVal(d.pmU):'—'}</td>
        <td ${tdR} style="text-align:right;padding:7px 10px;background:#f8faff;font-weight:700;color:${custoU>0&&d.qtdU>0?(d.mUnitU>=0?'var(--success)':'var(--danger)'):'var(--muted2)'}">${custoU>0&&d.qtdU>0?fmtVal(d.mUnitU):'—'}</td>
        <td ${tdR} style="text-align:right;padding:7px 10px;background:#f0f9f4;font-weight:700;color:${custoU>0&&d.qtdU>0?(d.mTotU>=0?'var(--success)':'var(--danger)'):'var(--muted2)'}">${custoU>0&&d.qtdU>0?fmtVal(d.mTotU):'—'}</td>
        <td ${tdR} style="text-align:right;padding:7px 10px;background:#f4fdf6;font-family:'Bebas Neue',sans-serif;font-size:16px;color:var(--butano)">${d.qtdB}</td>
        <td ${tdR} style="text-align:right;padding:7px 10px;background:#f4fdf6;color:var(--butano)">${d.qtdB>0?fmtVal(d.pmB):'—'}</td>
        <td ${tdR} style="text-align:right;padding:7px 10px;background:#f4fdf6;font-weight:700;color:${custoB>0&&d.qtdB>0?(d.mUnitB>=0?'var(--success)':'var(--danger)'):'var(--muted2)'}">${custoB>0&&d.qtdB>0?fmtVal(d.mUnitB):'—'}</td>
        <td ${tdR} style="text-align:right;padding:7px 10px;background:#ebfbf0;font-weight:700;color:${custoB>0&&d.qtdB>0?(d.mTotB>=0?'var(--success)':'var(--danger)'):'var(--muted2)'}">${custoB>0&&d.qtdB>0?fmtVal(d.mTotB):'—'}</td>
        <td ${tdR} style="text-align:right;padding:7px 10px;font-family:'Bebas Neue',sans-serif;font-size:16px">${d.totalQtd}</td>
        <td ${tdR} style="text-align:right;padding:7px 10px;font-weight:700;font-size:13px;color:${cor}">${fmtVal(d.mTotal)}</td>
        <td ${tdR} style="text-align:right;padding:7px 10px;font-weight:700;color:${pctColor}">${d.pctMargem.toFixed(1).replace('.',',')}%</td>
      </tr>`;
    }).join('');
  }

  if (chartMargemInst) { chartMargemInst.destroy(); chartMargemInst = null; }
  const ctx = document.getElementById('chartMargem');
  if (dados.length && (custoU > 0 || custoB > 0)) {
    const sortedG = [...dados].sort((a,b) => b.mTotal - a.mTotal);
    chartMargemInst = new Chart(ctx, {
      type: 'bar',
      plugins: [ChartDataLabels],
      data: {
        labels: sortedG.map(d => d.pr),
        datasets: [
          { label: 'Margem Ultra (R$)', data: sortedG.map(d => custoU>0?+d.mTotU.toFixed(2):0), backgroundColor: 'rgba(29,78,216,.75)', borderRadius: 6, borderSkipped: false },
          { label: 'Margem Butano (R$)', data: sortedG.map(d => custoB>0?+d.mTotB.toFixed(2):0), backgroundColor: 'rgba(21,128,61,.75)', borderRadius: 6, borderSkipped: false },
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position:'top', labels:{ font:{size:11}, usePointStyle:true } },
          datalabels: { display: false },
          tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmtVal(ctx.parsed.y)}` } }
        },
        scales: {
          x: { stacked: false, grid:{display:false}, ticks:{font:{size:11,weight:'600'},color:'#374151'} },
          y: { beginAtZero:true, grid:{color:'#f0f2f7'}, ticks:{callback: v => 'R$ '+fmtNum(v), font:{size:10}} }
        }
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', function(){
  const bm=document.getElementById('backupModal');
  // clique fora desabilitado
  const gm=document.getElementById('grupoLancModal');
  // clique fora desabilitado
  const egm=document.getElementById('editGrupoModal');
  // clique fora desabilitado
});
