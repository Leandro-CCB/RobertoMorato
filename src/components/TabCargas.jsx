import { useRef } from 'react';

// Conteúdo original extraído de index.html (mesma estrutura e ids).
// A logica (funcoes globais definidas nos scripts legados em /public/legacy)
// continua controlando esta aba exatamente como no app original,
// pois os ids/onclick foram preservados 1:1.

// ⚠️ CORREÇÃO: Trocamos as aspas simples por CRASES (`) para evitar erros de escape.
const HTML = `<div id="tab-cargas" class="page">

  <!-- Formulário de novo lançamento de carga -->
  <div class="card card-nova-carga">
    <div class="section-title">🚛 Nova Carga</div>

    <div class="carga-form-grid">
      <div class="form-group">
        <label>Data da Carga</label>
        <input type="date" id="cData" onchange="calcVencimentoAuto()" />
      </div>
      <div class="form-group">
        <label>NF (Nota Fiscal)</label>
        <input type="text" id="cNF" placeholder="Ex: 2823519" />
      </div>
      <div class="form-group">
        <label>Empresa (Comprou)</label>
        <select id="cEmpresa" onchange="calcVencimentoAuto()">
          <option value="">— Selecione —</option>
          <option value="BERTONI">Bertoni</option>
          <option value="ROSA">Rosa</option>
          <option value="PINHEIRO">Pinheiro</option>
          <option value="LIROMILS">Liromils</option>
          <option value="IMPERIO">Imperio</option>
        </select>
      </div>
      <div class="form-group">
        <label>Transportadora (Frete)</label>
        <select id="cTransp">
          <option value="IVG TRANSPORTES">IVG Transportes</option>
          <option value="BERTONI">Bertoni</option>
          <option value="OUTRO">Outro</option>
        </select>
      </div>
      <div class="form-group">
        <label>Caminhão</label>
        <select id="cCaminhao">
          <option value="">— Selecione —</option>
          <option value="FORD">🚛 Ford</option>
          <option value="MERCEDES">🚛 Mercedes</option>
          <option value="OUTRO">🚛 Outro</option>
        </select>
      </div>
      <div class="form-group">
        <label>Tipo (Ultra/Butano)</label>
        <select id="cTipo" onchange="_aplicarTipoCargaAosItens()">
          <option value="Ultragaz">🔵 Ultragaz</option>
          <option value="Butano">🟢 Butano</option>
        </select>
      </div>
      <div class="form-group">
        <label>Descarregar em</label>
        <select id="cDescarga">
          <option value="Franco da Rocha">📍 Franco da Rocha</option>
          <option value="Morato">📍 Morato</option>
        </select>
      </div>
    </div>

    <!-- Itens da Carga -->
    <div class="section-title" style="font-size:14px;margin-bottom:8px;">🛢️ Itens da Carga</div>
    <div style="display:grid;grid-template-columns:110px 1fr 130px 32px;gap:8px;padding:0 4px;margin-bottom:4px;">
      <label style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);text-align:center">Quantidade</label>
      <label style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);text-align:center">Produto</label>
      <label style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);text-align:center">Marca (se P 13)</label>
      <label></label>
    </div>
    <div id="cItensContainer"></div>
    <div style="margin-bottom:14px;">
      <button class="btn-add-linha" onclick="addItemCarga()">＋ Adicionar Produto</button>
    </div>

    <div class="carga-form-grid">
      <div class="form-group">
        <label>Valor da Carga (R$) <span style="font-size:9px;color:var(--muted2);font-weight:400">(opcional)</span></label>
        <input type="number" id="cValor" min="0" step="0.01" placeholder="0,00" oninput="calcCargaLiquido()" />
      </div>
      <div class="form-group">
        <label>Desconto (R$)</label>
        <input type="number" id="cDesconto" min="0" step="0.01" placeholder="0,00" oninput="calcCargaLiquido()" />
      </div>
      <div class="form-group">
        <label>Valor Líquido (R$)</label>
        <input type="text" id="cLiquido" readonly placeholder="R$ 0,00" />
      </div>
      <div class="form-group">
        <label>Valor do Frete (R$) <span style="font-size:9px;color:var(--ultra);font-weight:600">(auto)</span></label>
        <input type="number" id="cFrete" min="0" step="0.01" placeholder="0,00" />
      </div>
      <div class="form-group">
        <label>Status do Pagamento</label>
        <select id="cStatus">
          <option value="A VENCER">⏳ A Vencer</option>
          <option value="PAGO">✅ Pago</option>
          <option value="VENCIDO">❌ Vencido</option>
        </select>
      </div>
    </div>

    <div class="carga-form-grid" style="grid-template-columns:1fr 1fr;margin-bottom:14px;">
      <div class="form-group">
        <label>Data de Vencimento <span style="font-size:9px;color:var(--ultra);font-weight:600">(auto por empresa)</span></label>
        <div style="display:flex;gap:7px;align-items:center;">
          <input type="date" id="cVenc" style="flex:1;" />
          <button class="btn-prorrogar" onclick="abrirProrrogar()" title="Registrar boleto prorrogado">📅 Prorrogado</button>
        </div>
      </div>
      <div class="form-group">
        <label>Observação</label>
        <input type="text" id="cObs" placeholder="Ex: 20 TROCA P13, VG, DOAÇÃO…" />
      </div>
    </div>

    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
      <button class="btn-carga" onclick="addCarga()">✚ Registrar Carga</button>
      <span id="cargaErr" style="color:var(--danger);font-size:13px;font-weight:600;"></span>
    </div>
  </div>

  <!-- Resumo -->
  <div class="carga-summary" id="cargaSummary"></div>

  <!-- Filtros -->
  <div class="card">
    <div class="section-title">🔍 Filtros</div>
    <div class="carga-filter-bar">
      <div class="form-group"><label>Empresa</label>
        <select id="cfEmpresa" onchange="renderCargas()"><option value="">Todas</option></select>
      </div>
      <div class="form-group"><label>Produto</label>
        <select id="cfProduto" onchange="renderCargas()">
          <option value="">Todos</option>
          <option>P 05</option><option>P 13</option><option>P 20</option><option>P 45</option>
        </select>
      </div>
      <div class="form-group"><label>Status</label>
        <select id="cfStatus" onchange="renderCargas()">
          <option value="">Todos</option>
          <option>PAGO</option><option>A VENCER</option><option>VENCIDO</option>
        </select>
      </div>
      <div class="form-group"><label>Mês</label>
        <select id="cfMes" onchange="renderCargas()"><option value="">Todos</option></select>
      </div>
      <div style="display:flex;align-items:flex-end;">
        <button class="btn-pdf" onclick="exportarPDFCargas()">📄 Exportar PDF</button>
      </div>
    </div>
  </div>

  <!-- Tabela -->
  <div class="card">
    <div class="section-title">📋 Registro de Cargas</div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Produto</th>
            <th>NF</th>
            <th>Empresa</th>
            <th>Transportadora</th>
            <th>Caminhão</th>
            <th>Descarga</th>
            <th>Qtd</th>
            <th>Valor Carga</th>
            <th>Desconto</th>
            <th>Líquido</th>
            <th>Frete</th>
            <th>Vencimento</th>
            <th>Status</th>
            <th>Obs</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="tbodyCargas">
          <tr><td colspan="16" class="empty">Nenhuma carga registrada ainda.</td></tr>
        </tbody>
        <tfoot id="tfootCargas"></tfoot>
      </table>
    </div>
  </div>

  <!-- MODAL EDITAR CARGA -->
  <div class="modal-overlay carga-modal" id="editCargaModal">
    <div class="modal-box">
      <div class="modal-title">✏️ Editar Carga</div>
      <input type="hidden" id="editCargaId" />
      <div class="carga-form-3">
        <div class="form-group"><label>Data da Carga</label><input type="date" id="ecData" /></div>
        <div class="form-group"><label>NF</label><input type="text" id="ecNF" /></div>
      </div>
      <div style="margin-bottom:8px;">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);margin-bottom:6px;">🛢️ Itens da Carga</div>
        <div style="display:grid;grid-template-columns:110px 1fr 32px;gap:8px;padding:0 4px;margin-bottom:4px;">
          <label style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);text-align:center">Quantidade</label>
          <label style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);text-align:center">Produto</label>
          <label></label>
        </div>
        <div id="ecItensContainer"></div>
        <button class="btn-add-linha" onclick="addItemEditCarga()" style="margin-top:4px;">＋ Adicionar Produto</button>
      </div>
      <div class="carga-form-3">
        <div class="form-group"><label>Empresa</label>
          <select id="ecEmpresa">
            <option value="">— Selecione —</option>
            <option value="BERTONI">Bertoni</option>
            <option value="ROSA">Rosa</option>
            <option value="PINHEIRO">Pinheiro</option>
            <option value="LIROMILS">Liromils</option>
            <option value="IMPERIO">Imperio</option>
          </select>
        </div>
        <div class="form-group"><label>Transportadora</label>
          <select id="ecTransp">
            <option value="IVG TRANSPORTES">IVG Transportes</option>
            <option value="BERTONI">Bertoni</option>
            <option value="OUTRO">Outro</option>
          </select>
        </div>
        <div class="form-group"><label>Caminhão</label>
          <select id="ecCaminhao">
            <option value="">— Selecione —</option>
            <option value="FORD">🚛 Ford</option>
            <option value="MERCEDES">🚛 Mercedes</option>
            <option value="OUTRO">🚛 Outro</option>
          </select>
        </div>
        <div class="form-group"><label>Tipo (Ultra/Butano)</label>
          <!-- CORREÇÃO: Aspas simples dentro de crases não precisam de escape -->
          <select id="ecTipo" onchange="_aplicarTipoCargaAosItens('ecItensContainer')">
            <option value="Ultragaz">🔵 Ultragaz</option>
            <option value="Butano">🟢 Butano</option>
          </select>
        </div>
        <div class="form-group"><label>Descarregar em</label>
          <select id="ecDescarga">
            <option value="Franco da Rocha">📍 Franco da Rocha</option>
            <option value="Morato">📍 Morato</option>
          </select>
        </div>
      </div>
      <div class="carga-form-3">
        <div class="form-group"><label>Valor Carga (R$) <span style="font-size:9px;color:var(--muted2);font-weight:400">(opcional)</span></label><input type="number" id="ecValor" min="0" step="0.01" oninput="calcEditCargaLiquido()" /></div>
        <div class="form-group"><label>Desconto (R$)</label><input type="number" id="ecDesconto" min="0" step="0.01" oninput="calcEditCargaLiquido()" /></div>
        <div class="form-group"><label>Líquido</label><input type="text" id="ecLiquido" readonly /></div>
      </div>
      <div class="carga-form-3">
        <div class="form-group"><label>Frete (R$)</label><input type="number" id="ecFrete" min="0" step="0.01" /></div>
        <div class="form-group"><label>Vencimento</label><input type="date" id="ecVenc" /></div>
        <div class="form-group"><label>Status</label>
          <select id="ecStatus">
            <option value="A VENCER">⏳ A Vencer</option>
            <option value="PAGO">✅ Pago</option>
            <option value="VENCIDO">❌ Vencido</option>
          </select>
        </div>
      </div>
      <div class="carga-form-2" style="margin-bottom:12px;">
        <div class="form-group"><label>Observação</label><input type="text" id="ecObs" /></div>
      </div>
      <div class="modal-actions">
        <button class="btn-carga" onclick="salvarEdicaoCarga()">💾 Salvar</button>
        <button class="btn-secondary" onclick="fecharCargaModal()">✕ Cancelar</button>
        <span id="editCargaErr" style="color:var(--danger);font-size:13px;font-weight:600;align-self:center;"></span>
      </div>
    </div>
  </div>
  
  <!-- MODAL CONFIRMACAO DE TROCA -->
  <div class="modal-overlay troca-modal" id="trocaModal">
    <div class="modal-box troca-box">
      <div class="troca-icon">🔄</div>
      <div class="troca-title">Essa carga é uma troca?</div>
      <div class="troca-sub">Você lançou uma quantidade sem valor (R$ 0,00 ou em branco).<br>Confirme se esses botijões devem ser contabilizados como <strong>troca</strong>.</div>
      <div class="troca-actions">
        <button class="btn-troca-sim" onclick="resolverTroca(true)">✅ Sim, é troca</button>
        <button class="btn-troca-nao" onclick="resolverTroca(false)">➡️ Não, seguir normal</button>
      </div>
    </div>
  </div>
</div>`;

export default function TabCargas() {
  const ref = useRef(null);
  return <div ref={ref} dangerouslySetInnerHTML={{ __html: HTML }} />;
}
