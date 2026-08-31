import AuthGate from './components/AuthGate.jsx';
import AppHeader from './components/AppHeader.jsx';
import TabUsuarios from './components/TabUsuarios.jsx';
import TabLancamento from './components/TabLancamento.jsx';
import TabResumo from './components/TabResumo.jsx';
import TabCargas from './components/TabCargas.jsx';
import TabEstoque from './components/TabEstoque.jsx';
import TabMargem from './components/TabMargem.jsx';
import TabFiado from './components/TabFiado.jsx';
import TabDeposito from './components/TabDeposito.jsx';
import TabConfig from './components/TabConfig.jsx';
import BackupModal from './components/BackupModal.jsx';

// Estrutura idêntica ao index.html original:
// #authGate -> #appHeader (abas) -> #main-content (uma div .page por aba) -> #backupModal
// A troca de aba continua sendo feita pela função global showTab() (definida em
// /public/legacy/01_head_globals.js), exatamente como no app original — cada
// botão de aba no header chama onclick="showTab('nome', this)".
export default function App() {
  return (
    <>
      <AuthGate />
      <AppHeader />
      <div id="main-content" style={{ display: 'none' }}>
        <TabUsuarios />
        <TabLancamento />
        <TabResumo />
        <TabCargas />
        <TabEstoque />
        <TabMargem />
        <TabFiado />
        <TabDeposito />
        <TabConfig />
      </div>
      <BackupModal />
    </>
  );
}
