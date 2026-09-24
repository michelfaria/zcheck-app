/**
 * Vitrine — monta as telas REAIS do app sobre os dados de exemplo, no browser,
 * para o runner (run.mjs) fotografar. Não é rota do Next e não vai para o
 * deploy: vive num bundle do esbuild em node_modules/.cache.
 *
 * A tela sai do hash da URL: #painel, #rotina, #checklist, #id, #unidades,
 * #onboarding.
 *
 * O fetch é dublado ANTES de qualquer módulo do app avaliar. O cliente do
 * Supabase guarda a referência de `fetch` quando é criado, e sem a dublagem a
 * tela de execução iria ao banco de PRODUÇÃO (a anon key está no bundle) — é
 * leitura, mas a telemetria e o claim da rodada gravam. Aqui nada sai da
 * máquina: toda chamada responde com a fixture ou vazio.
 */

import { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';

const telaPedida = (location.hash || '#painel').slice(1);
let rodadaAoVivo = [];

const resposta = (body) => new Response(JSON.stringify(body), {
  status: 200, headers: { 'Content-Type': 'application/json' },
});
window.fetch = async (url, init = {}) => {
  const u = typeof url === 'string' ? url : (url?.url || String(url));
  const metodo = (init.method || url?.method || 'GET').toUpperCase();
  if (u.includes('/rest/v1/live_tasks') && metodo === 'GET') return resposta(rodadaAoVivo);
  return resposta([]);
};
// Sem service worker, sem push, sem pedido de permissão na captura.
try { Object.defineProperty(navigator, 'serviceWorker', { value: undefined }); } catch (_) { /* navegador sem SW */ }

// Import dinâmico: garante que o app só avalia DEPOIS da dublagem acima.
const app = await import('../../app/app/page.js');
const { PainelConsolidado } = await import('../../components/painel/PainelConsolidado.js');
const { buildJit } = await import('../../components/painel/JitPanel.js');
const { UnitsContext, SectorsContext } = await import('../../components/painel/context.js');
const SideNavMod = await import('../../components/SideNav.js');
const fx = await import('./fixtures.js');
const { C, W, T } = await import('../../lib/tokens.js');

const SideNav = SideNavMod.default;
const { NAV_ITEMS, BOTTOM_NAV_ORDER } = SideNavMod;
const { Header, ExecutarView, ExecutionScreen, OperationalIdView, UnidadesView, CompanyOnboarding } = app;

const ROLE_TABS = {
  colaborador: ['executar', 'painel', 'id'],
  gestao: ['executar', 'painel', 'unidades', 'gerenciar', 'usuarios', 'id', 'equipe'],
};

const completions = fx.buildCompletions();
const noop = () => {};

// Cópia da BottomNav do app (não é exportada): mesmos itens, mesma ordem, mesmo
// visual. Só existe para a moldura do celular ficar igual à de verdade.
function BottomNav({ tab, accent, allowedTabs }) {
  const items = BOTTOM_NAV_ORDER.map(id => NAV_ITEMS.find(it => it.id === id)).filter(Boolean)
    .filter(it => allowedTabs.includes(it.id));
  return (
    <nav className="zc-bottomnav sticky bottom-0 flex" aria-label="Navegação principal"
      style={{ background: 'white', borderTop: `1px solid ${C.border}` }}>
      {items.map(it => {
        const Icon = it.icon;
        const active = tab === it.id;
        return (
          <button key={it.id} className="flex-1 flex flex-col items-center gap-1"
            style={{ background: 'none', border: 'none', padding: '10px 4px 12px', minHeight: 56 }}>
            <Icon size={22} color={active ? accent : C.mutedLight} />
            <span style={{ fontSize: T.label, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.06em', color: active ? accent : C.mutedLight, whiteSpace: 'nowrap' }}>
              {it.short || it.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

/** A casca do app: rail (desktop), cabeçalho, conteúdo e barra inferior (celular). */
function Shell({ tab, user, unit, allSelected, children }) {
  const allowedTabs = ROLE_TABS[user.role];
  const dateLabel = new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
  return (
    <UnitsContext.Provider value={fx.units}>
      <SectorsContext.Provider value={[]}>
        <div className="zc-root" style={{ minHeight: '100vh', color: C.ink }}>
          <SideNav tab={tab} setTab={noop} allowedTabs={allowedTabs} pendingCount={0}
            unitName={allSelected ? 'Todas as lojas' : unit.name} dateLabel={dateLabel} />
          <div className="zc-main">
            <Header unit={unit} onSelectUnit={noop} allSelected={allSelected} allUnits={fx.units}
              currentUser={user} canSwitchUnit={user.unitId == null} onLogout={noop}
              isOnline syncing={false} pendingSync={0} pushEnabled onEnablePush={noop} onDisablePush={noop}
              company={fx.company} onStartTour={noop} />
            <main className="zc-content" style={{ flex: 1 }}>{children}</main>
            <BottomNav tab={tab} accent={unit.color} allowedTabs={allowedTabs} />
          </div>
        </div>
      </SectorsContext.Provider>
    </UnitsContext.Provider>
  );
}

const centro = fx.units[0];

const TELAS = {
  // Diretoria olhando a rede inteira — o "Agora" no topo do Painel.
  painel: () => {
    const jit = buildJit(completions, fx.templates, [], fx.units, null, centro.id);
    return (
      <Shell tab="painel" user={fx.gestor} unit={centro} allSelected>
        <PainelConsolidado
          unit={centro} templates={fx.templates} completions={completions} closures={[]}
          canSeeAllUnits currentUser={fx.gestor} users={fx.users}
          jit={jit} actionPlans={fx.buildActionPlans()} plansLoaded
          allUnitsSelected onReview={noop} disputes={[]} onResolveDispute={noop}
          onCreatePlan={async () => true} onCompletePlan={async () => true} onNavigate={noop} />
      </Shell>
    );
  },
  // A lista do turno da colaboradora — o que ela abre ao entrar.
  rotina: () => (
    <Shell tab="executar" user={fx.colaboradora} unit={centro} allSelected={false}>
      <ExecutarView unit={centro} templates={fx.templates.filter(t => t.unitId === centro.id)}
        completions={completions.filter(c => c.unitId === centro.id)} closures={[]}
        currentUser={fx.colaboradora} onSaveCompletion={noop} onRefreshCompletions={noop} />
    </Shell>
  ),
  // Dentro de um checklist, no meio da rodada: a abertura atrasada da cozinha
  // da Praia, com a câmara fria — crítica, com foto — ainda por fazer no topo.
  checklist: () => {
    const praia = fx.units.find(u => u.id === 'praia');
    const t = fx.templates.find(x => x.id === 'praia-cozinha-abertura');
    rodadaAoVivo = fx.liveTasksFor(t.id, praia.id, [t.items[1].id, t.items[2].id], fx.operadorPraia);
    return (
      <Shell tab="executar" user={fx.operadorPraia} unit={praia} allSelected={false}>
        <ExecutionScreen template={t} unit={praia} currentUser={fx.operadorPraia}
          completions={completions.filter(c => c.unitId === praia.id)} closures={[]}
          onCancel={noop} onComplete={noop} onDone={noop} />
      </Shell>
    );
  },
  // O ID operacional da colaboradora.
  id: () => (
    <Shell tab="id" user={fx.colaboradora} unit={centro} allSelected={false}>
      <OperationalIdView targetUser={fx.colaboradora} viewer={fx.colaboradora}
        completions={completions} templates={fx.templates} accent={centro.color} onChangePhoto={noop} />
    </Shell>
  ),
  // Onboarding de uma hamburgueria nova (não vai para a landing: é para
  // conferir a pergunta "qual é a sua operação?" sem precisar de conta nova).
  onboarding: () => {
    const lojas = [{ id: 'burger', name: 'Burger Centro', color: '#C2622E', sectors: ['Cozinha', 'Expedição', 'Salão'], timezone: fx.TZ }];
    return (
      <UnitsContext.Provider value={lojas}>
        <CompanyOnboarding company={{ id: 'burger', name: 'Burger Exemplo' }} units={lojas} currentUser={fx.gestor}
          onCreateTemplates={async () => {}} onClose={noop} onGoToTab={noop} onStartTour={noop} />
      </UnitsContext.Provider>
    );
  },
  // O ranking das lojas.
  unidades: () => (
    <Shell tab="unidades" user={fx.gestor} unit={centro} allSelected>
      <UnidadesView units={fx.units} templates={fx.templates} completions={completions} closures={[]}
        currentUser={fx.gestor} canSeeAllUnits accent={centro.color} onBack={noop} />
    </Shell>
  ),
};

const render = TELAS[telaPedida] || TELAS.painel;
createRoot(document.getElementById('root')).render(h(render));
// O runner espera por esta marca: a primeira pintura mais os efeitos (a rodada
// ao vivo chega por fetch) já assentaram.
setTimeout(() => { document.body.dataset.pronto = '1'; }, 1200);
