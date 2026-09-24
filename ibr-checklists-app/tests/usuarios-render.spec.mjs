/**
 * Teste de RENDERIZAÇÃO da aba Usuários — o seletor de loja do cabeçalho e o
 * medidor de vagas (10 por loja ativa + vaga adicional de R$ 17,00/mês).
 *
 *   cd ibr-checklists-app && node tests/usuarios-render.spec.mjs
 *
 * ── Por que este arquivo existe ──────────────────────────────────────────────
 *
 * A aba Usuários recebia a lista inteira da empresa e ignorava a loja escolhida
 * no cabeçalho: trocar de IBR1 para IBR2 não mudava uma linha da tela. Não é
 * erro de cálculo — nada é calculado ali — é erro do que a tela MOSTRA, a mesma
 * classe de defeito que `painel-render.spec.mjs` existe para pegar.
 *
 * Como lá: `renderToStaticMarkup` sobre fixtures, sem sessão logada e sem
 * segredo. Efeitos não rodam em SSR, então o que se afirma aqui é a primeira
 * pintura — que é onde o filtro mora.
 *
 * ── Vagas (23/09/2026) ───────────────────────────────────────────────────────
 *
 * O medidor conta a EMPRESA com o número do BANCO (company_user_quota): uma
 * linha por pessoa, suspenso fora, gerente de duas lojas e diretoria de
 * "todas" contando UMA vez — isso o PGlite prova no banco. Aqui se prova que a
 * tela usa esse número e não a lista: a lista é carregada uma vez no login e
 * não vê a suspensão feita em outro aparelho, e contar por ela oferecia
 * contratar (e cobrar) uma vaga que já estava livre. Nem a contagem loja a
 * loja (`userInUnit`), que contaria a gerência multi-loja duas vezes. Cota
 * nula (migration ausente) não pode desenhar medidor nenhum, e conta isenta
 * (cortesia) só diz que não tem limite. Os diálogos de "sem vaga" e a folha
 * "Plano e vagas" também são afirmados pelo texto: é a promessa de cobrança
 * que a diretoria lê antes de clicar.
 *
 * ── Na tela montada (jsdom, seção 8) ─────────────────────────────────────────
 *
 * O que só existe depois dos efeitos — a releitura da cota e o foco — é
 * afirmado com a tela montada em jsdom (mesmo harness do auto-concluir):
 *   · o painel de assinatura mostra o MESMO valor que o checkoutPlan do
 *     servidor cobra, lido na hora, e sem cota não mostra preço nem "Assinar";
 *   · a folha "Plano e vagas" nunca deixa o foco num botão `disabled` (o foco
 *     cairia no <body> e o Esc e a trava do Tab, que moram no painel, parariam
 *     de funcionar) — nem depois de um 'stale', nem no mínimo do stepper, nem
 *     quando a cota chega com a folha já aberta;
 *   · a confirmação PAGA abre com o foco no painel, nunca em "Contratar e criar".
 * O jsdom não refaz o foco de um botão que vira `disabled` (o navegador joga
 * no body): por isso a afirmação é "o elemento focado não está `disabled`".
 */

import { createElement as h, useState, act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

let ok = true;
const check = (c, m) => { if (!c) ok = false; console.log(`  ${c ? '✓' : '✗'} ${m}`); };

// Mesmo esquema de bundle do painel-render: dentro do projeto (para o Node achar
// `node_modules`), React externo (uma instância só) e o shim de `require` que o
// build CJS do lucide-react precisa.
const dir = join(process.cwd(), 'node_modules', '.cache', 'zc-usuarios-render');
await mkdir(dir, { recursive: true });
const entry = join(dir, 'entry.js');
const out = join(dir, 'bundle.mjs');
await writeFile(entry, `
  export { UsersView, userInUnit } from '${process.cwd()}/app/app/page.js';
  export { UnitsContext } from '${process.cwd()}/components/painel/context.js';
  export { SubscribePanel, checkoutError } from '${process.cwd()}/app/app/page.js';
  export { default as PlanoVagas, SemVagaDialogo, LojaBloqueadaDialogo, resumoVagas, bloqueioDeLoja, bloqueioDeLojaNoBanco, lojaSaiDaContagem, mensagemVagasSalvas, avisoVagasContratadas } from '${process.cwd()}/components/PlanoVagas.js';
  export { checkoutPlan } from '${process.cwd()}/lib/seats.js';
  export { formatBRL } from '${process.cwd()}/lib/plans.js';
`);
await build({
  entryPoints: [entry], outfile: out, bundle: true, format: 'esm',
  platform: 'node', jsx: 'automatic', logLevel: 'silent',
  loader: { '.js': 'jsx' },
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
const {
  UsersView, userInUnit, UnitsContext, PlanoVagas, SemVagaDialogo, LojaBloqueadaDialogo, resumoVagas, bloqueioDeLoja,
  bloqueioDeLojaNoBanco, lojaSaiDaContagem, mensagemVagasSalvas, avisoVagasContratadas,
  SubscribePanel, checkoutError, checkoutPlan, formatBRL,
} = await import(out);

// ── Fixtures ────────────────────────────────────────────────────────────────
const units = [
  { id: 'ibr1', name: 'IBR1', color: '#2f6f4e', sectors: [], timezone: 'America/Sao_Paulo' },
  { id: 'ibr2', name: 'IBR2', color: '#c026d3', sectors: [], timezone: 'America/Sao_Paulo' },
];
const users = [
  { id: 'u1', name: 'Chefe Geral', role: 'gestao', unitId: null, pin: '1111' },
  { id: 'u2', name: 'Gerente Duas Lojas', role: 'gerencia', unitId: 'ibr1,ibr2', pin: '2222' },
  { id: 'u3', name: 'Ana da Um', role: 'colaborador', unitId: 'ibr1', pin: '3333' },
  { id: 'u4', name: 'Bruno do Dois', role: 'colaborador', unitId: 'ibr2', pin: '4444' },
];
const gestor = users[0];

const render = (unitId) => renderToStaticMarkup(
  h(UnitsContext.Provider, { value: units },
    h(UsersView, { users, onSaveUsers: async () => {}, currentUser: gestor, unitId })));

const tem = (html, s) => html.includes(s);

// ── 1. "Todas" mostra a empresa inteira ─────────────────────────────────────
console.log('═══ Todas (unitId nulo) ═══');
const todas = render(null);
check(tem(todas, 'Ana da Um') && tem(todas, 'Bruno do Dois'), 'as duas lojas aparecem');
check(tem(todas, 'Chefe Geral') && tem(todas, 'Gerente Duas Lojas'), 'quem não é de uma loja só aparece');
check(tem(todas, 'Todas as lojas · 4 pessoas'), 'o escopo está escrito na tela');

// ── 2. Uma loja escolhida filtra a lista ────────────────────────────────────
console.log('\n═══ loja escolhida no cabeçalho ═══');
const ibr1 = render('ibr1');
check(tem(ibr1, 'Ana da Um'), 'IBR1 mostra quem é da IBR1');
check(!tem(ibr1, 'Bruno do Dois'), 'IBR1 NÃO mostra quem é da IBR2');
check(tem(ibr1, 'IBR1 · 3 pessoas'), 'a contagem segue o filtro');

const ibr2 = render('ibr2');
check(tem(ibr2, 'Bruno do Dois'), 'IBR2 mostra quem é da IBR2');
check(!tem(ibr2, 'Ana da Um'), 'IBR2 NÃO mostra quem é da IBR1');

// ── 3. Quem alcança a loja continua visível ─────────────────────────────────
// Diretoria (sem loja) e gerência multi-loja TÊM acesso à loja: sumir daqui
// faria a tela afirmar que a loja está sem gestão.
console.log('\n═══ quem tem acesso à loja não some ═══');
check(tem(ibr1, 'Chefe Geral'), 'diretoria (sem loja fixa) aparece na loja');
check(tem(ibr2, 'Chefe Geral'), 'e na outra também');
check(tem(ibr1, 'Gerente Duas Lojas') && tem(ibr2, 'Gerente Duas Lojas'),
  'gerência com duas lojas aparece nas duas');
check(tem(todas, 'IBR1 + IBR2'),
  'a linha da gerência multi-loja mostra as duas lojas (antes ficava em branco)');

// ── 4. O predicado, direto ──────────────────────────────────────────────────
console.log('\n═══ userInUnit ═══');
check(userInUnit({ unitId: 'ibr1' }, null) === true, 'sem loja escolhida, passa todo mundo');
check(userInUnit({ unitId: 'ibr1' }, 'ibr2') === false, 'loja diferente não passa');
check(userInUnit({ unitId: 'ibr1, ibr2' }, 'ibr2') === true, 'lista com espaço é tratada');
check(userInUnit({ unitId: null }, 'ibr2') === true, 'sem loja fixa passa em qualquer loja');

// ── 5. Medidor de vagas ─────────────────────────────────────────────────────
console.log('\n═══ medidor de vagas ═══');
// A mesma equipe + uma pessoa suspensa. 5 linhas, 4 ocupam vaga.
const comSuspensa = [...users, { id: 'u5', name: 'Carla Suspensa', role: 'colaborador', unitId: 'ibr1', pin: '5555', suspended: true }];
const cota = (extra = {}) => ({
  active_users: 4, active_units: 2, included_seats: 20, extra_seats: 0, capacity: 20,
  free_seats: 16, extra_seat_price: 17, exempt: false, extra_seats_in_use: 0, ...extra,
});
const renderV = ({ unitId = null, lista = comSuspensa, quota = cota(), quem = gestor, onOpenSeats } = {}) =>
  renderToStaticMarkup(
    h(UnitsContext.Provider, { value: units },
      h(UsersView, { users: lista, onSaveUsers: async () => {}, currentUser: quem, unitId, quota, onOpenSeats })));

const v = renderV();
check(tem(v, 'Vagas: 4 de 20 em uso · 20 da franquia (2 lojas × 10)'),
  'o em-uso do banco (suspenso fora, gerente de duas lojas UMA vez): 4 de 20');
check(!tem(v, 'Vagas: 5 de') && !tem(v, 'Vagas: 6 de'),
  'nem a suspensa (5) nem a contagem loja a loja (6) aparecem');
check(tem(v, '16 vagas livres'), 'as vagas livres estão escritas');
check(tem(v, 'Todas as lojas · 5 pessoas'), 'a linha do escopo segue contando todo mundo (inclusive suspenso)');

const v1 = renderV({ unitId: 'ibr1' });
check(tem(v1, 'Vagas: 4 de 20 em uso'), 'com a IBR1 no cabeçalho o medidor segue contando a EMPRESA');
check(tem(v1, 'IBR1 · 4 pessoas, incluindo quem tem acesso a todas as lojas'), 'e a linha do escopo segue a loja');

check(!tem(v, 'Plano e vagas'), 'sem onOpenSeats não há botão de Plano e vagas');
check(tem(renderV({ onOpenSeats: () => {} }), 'Plano e vagas'), 'com onOpenSeats a diretoria vê o botão');

// O exemplo do contrato: 23 ativos, 2 lojas, 5 adicionais contratadas.
const vinteETres = Array.from({ length: 23 }, (_, i) => ({ id: `x${i}`, name: `Pessoa ${i}`, role: 'colaborador', unitId: 'ibr1', pin: '0000' }));
const vExtra = renderV({ lista: vinteETres, quota: cota({ extra_seats: 5, capacity: 25, active_users: 23, extra_seats_in_use: 3 }) });
check(tem(vExtra, 'Vagas: 23 de 25 em uso · 20 da franquia (2 lojas × 10) + 5 adicionais contratadas (R$ 85,00/mês)'),
  'adicionais contratadas com o valor em R$ com centavos');

const cheio = Array.from({ length: 20 }, (_, i) => ({ id: `c${i}`, name: `Cheio ${i}`, role: 'colaborador', unitId: 'ibr1', pin: '0000' }));
const cotaCheia = cota({ active_users: 20, free_seats: 0 });
// A lista diz 20 ativos, mas outro aparelho suspendeu alguém: o banco diz 19.
// Vale o banco — senão a diretoria pagaria uma vaga que já está livre.
const vVelha = renderV({ lista: cheio, quota: cota({ active_users: 19, free_seats: 1 }) });
check(tem(vVelha, 'Vagas: 19 de 20 em uso') && tem(vVelha, '1 vaga livre') && !tem(vVelha, 'Nenhuma vaga livre'),
  'lista velha (20) × banco (19): o medidor segue o banco — 1 vaga livre, nada a contratar');
const vCheio = renderV({ lista: cheio, quota: cotaCheia });
check(tem(vCheio, 'Nenhuma vaga livre — o próximo usuário contrata 1 vaga adicional de R$ 17,00/mês'),
  'sem vaga livre, a diretoria lê o custo antes de criar alguém');
const gerente = { id: 'g1', name: 'Gerente', role: 'gerencia', unitId: null };
check(tem(renderV({ lista: cheio, quota: cotaCheia, quem: gerente, onOpenSeats: () => {} }), 'peça à diretoria para contratar vagas'),
  'quem não é diretoria é mandado pedir à diretoria');
check(!tem(renderV({ lista: cheio, quota: cotaCheia, quem: gerente, onOpenSeats: () => {} }), 'Plano e vagas'),
  'e não recebe o botão de contratar');
// Acima da capacidade (loja removida): criar ainda é possível contratando —
// o texto diz o que fazer, e não que "tudo fica bloqueado".
const vAcima = renderV({ lista: cheio, quota: cota({ active_users: 22, free_seats: 0 }) });
check(tem(vAcima, '2 usuários acima da capacidade — para criar ou reativar alguém, contrate vagas ou suspenda usuários.'),
  'acima da capacidade: a diretoria lê o que fazer');

const vIsenta = renderV({ quota: cota({ exempt: true }) });
check(tem(vIsenta, 'Conta cortesia — sem limite de vagas'), 'conta isenta diz que não tem limite');
check(!tem(vIsenta, 'Vagas:'), 'e não desenha medidor');

const vSem = renderV({ quota: null });
check(!tem(vSem, 'Vagas:') && !tem(vSem, 'Conta cortesia') && !tem(vSem, 'Plano e vagas'),
  'cota nula (migration ausente) não desenha nada de vagas');
check(tem(render(null), 'Todas as lojas · 4 pessoas') && !tem(render(null), 'Vagas:'),
  'sem a prop quota a aba segue igual a antes');

// Piso de 1 loja: empresa recém-criada, 0 lojas ativas, tem 10 vagas.
check(tem(renderV({ quota: cota({ active_units: 0, included_seats: 10, capacity: 10 }) }), '10 da franquia (mínimo de 1 loja × 10)'),
  'com 0 lojas ativas vale o piso de 1 loja');

// resumoVagas direto: lista vazia (fallback offline sem cache) cai no número do banco.
check(resumoVagas(cota({ active_users: 7 }), []).emUso === 7, 'lista vazia usa o em-uso do banco');
check(resumoVagas(null, users) === null, 'sem cota não há resumo');

// ── 6. Diálogos de vaga e "Plano e vagas" ───────────────────────────────────
console.log('\n═══ diálogos de vaga ═══');
const rCheio = resumoVagas(cotaCheia, cheio);
const assinante = { plan_tier: 'anual', subscription_status: 'active' };
const emTrial = { subscription_status: 'trialing', trial_ends_at: new Date(Date.now() + 5 * 864e5).toISOString() };
const dlg = (props) => renderToStaticMarkup(h(SemVagaDialogo, { onClose: () => {}, onContratar: async () => null, ...props }));

const dNovo = dlg({ tipo: 'insert', acao: 'criar', nome: 'Nova', resumo: rCheio, company: assinante, podeContratar: true });
check(tem(dNovo, 'Contratar 1 vaga adicional por R$ 17,00/mês, a partir da próxima fatura.'), 'confirmação diz custo e quando vale');
check(tem(dNovo, 'Contratar e criar'), 'a ação principal diz o que acontece');
check(tem(dNovo, 'A mensalidade passa a R$ 211'), 'com plano conhecido, o novo total (2×97 + 17)');
check(tem(dNovo, 'role="dialog"') && tem(dNovo, 'aria-modal="true"') && tem(dNovo, 'aria-labelledby='),
  'é um diálogo acessível: role, aria-modal e título ligado');

const dTrial = dlg({ tipo: 'insert', acao: 'aprovar', resumo: rCheio, company: emTrial, podeContratar: true });
check(tem(dTrial, 'Contratar 1 vaga adicional por R$ 17,00/mês, cobrada a partir da assinatura.'), 'no teste: cobrada a partir da assinatura');
check(tem(dTrial, 'Contratar e aprovar') && !tem(dTrial, 'A mensalidade passa a'), 'aprovação no teste, sem total inventado');

const dGer = dlg({ tipo: 'insert', resumo: rCheio, company: assinante, podeContratar: false });
check(tem(dGer, 'Sem vaga livre — peça à diretoria para contratar vagas.') && !tem(dGer, 'Contratar e'),
  'gerência não recebe opção de contratar');

const dReat = dlg({ tipo: 'reactivate', nome: 'Ana', resumo: rCheio, company: assinante, podeContratar: true, onAbrirPlano: () => {} });
check(tem(dReat, 'Sem vaga para reativar') && tem(dReat, 'Contratar vagas') && tem(dReat, 'Cancelar'),
  'reativação sem vaga é bloqueio com "Contratar vagas" e "Cancelar"');
check(!tem(dReat, 'Contratar 1 vaga adicional') && !tem(dReat, 'Contratar e'), 'e sem contratação embutida');
check(tem(dReat, 'não há vaga livre agora: 20 de 20 vagas em uso') && !tem(dReat, 'ocupada por outra pessoa'),
  'a reativação diz o que é verdade (sem vaga livre), sem inventar que alguém ocupou a vaga');

// Assinatura cancelada (ainda no período pago) ou em atraso: não há "próxima
// fatura" nem "mensalidade" a prometer.
const cancelada = { plan_tier: 'anual', subscription_status: 'canceled', current_period_end: new Date(Date.now() + 10 * 864e5).toISOString() };
const dCanc = dlg({ tipo: 'insert', acao: 'criar', resumo: rCheio, company: cancelada, podeContratar: true });
check(tem(dCanc, 'cobrada a partir da próxima assinatura') && !tem(dCanc, 'próxima fatura') && !tem(dCanc, 'A mensalidade passa a'),
  'cancelada: a vaga entra na próxima assinatura, sem total de mensalidade');

// Recusa do banco com a tela achando vaga livre: vale o número de quem recusou.
const dRecusa = dlg({ tipo: 'insert', acao: 'criar', resumo: resumoVagas(cota(), []), company: assinante, podeContratar: true,
  detalhe: { active: 25, capacity: 25, action: 'insert' } });
check(tem(dRecusa, 'As 25 vagas estão em uso') && tem(dRecusa, 'Contratar 1 vaga adicional'),
  'recusa do banco × cota velha da tela: os números são os do banco');

check(mensagemVagasSalvas({ ok: true, pending: true }, 'assinatura') === 'Vagas atualizadas — o ajuste da mensalidade está em processamento.',
  'ajuste do MP pendente: o toast não promete a próxima fatura');
check(mensagemVagasSalvas({ ok: true, adjusted: true }, 'assinatura') === 'Vagas atualizadas — vale a partir da próxima fatura.',
  'ajuste aplicado: vale a partir da próxima fatura');
check(mensagemVagasSalvas({ ok: true }, 'teste') === 'Vagas atualizadas — cobradas a partir da assinatura.', 'no teste: a partir da assinatura');

const pv = renderToStaticMarkup(h(PlanoVagas, {
  quota: cota({ extra_seats: 5, capacity: 25, active_users: 23, extra_seats_in_use: 3 }),
  users: vinteETres, company: assinante, currentUser: gestor, onClose: () => {},
}));
check(tem(pv, '20 vagas da franquia (2 lojas × 10) — não reduzíveis'), 'a franquia aparece fixa e não reduzível');
check(tem(pv, 'Mínimo de 3: são as vagas adicionais em uso hoje. Para reduzir mais, suspenda usuários antes.'),
  'o mínimo do stepper são as adicionais em uso, com a saída explicada');
check(tem(pv, 'Total mensal: R$ 279/mês'), 'total = 2 lojas × R$ 97 + 5 × R$ 17,00');
check(tem(pv, 'Vale a partir da próxima fatura'), 'e diz quando vale');
check(tem(renderToStaticMarkup(h(PlanoVagas, { quota: cota(), users: comSuspensa, company: emTrial, currentUser: gestor, onClose: () => {} })),
  'cobradas a partir da assinatura'), 'no teste, Plano e vagas diz que nada é cobrado ainda');
const pvCanc = renderToStaticMarkup(h(PlanoVagas, { quota: cota(), users: comSuspensa, company: cancelada, currentUser: gestor, onClose: () => {} }));
check(tem(pvCanc, 'Sem assinatura ativa') && !tem(pvCanc, 'Vale a partir da próxima fatura'),
  'assinatura cancelada: Plano e vagas não promete próxima fatura');
// Nenhum botão da folha usa `disabled`: "Salvar vagas" sem mudança é
// aria-disabled (e cinza), porque o `disabled` sob o foco jogava o foco no body.
check(!tem(pv, 'disabled=""') && /aria-disabled="true"[^>]*>Salvar vagas</.test(pv),
  '"Salvar vagas" sem mudança é aria-disabled, nunca `disabled`');

// Acima da capacidade (loja removida): a primeira frase tem de bater com o
// número que a oferta contrata. 13 ativos, 10 vagas → para criar mais uma,
// faltam 4 — e não "as 10 vagas estão em uso… é preciso uma vaga adicional".
const rAcima = resumoVagas(cota({ active_users: 13, active_units: 1, included_seats: 10, capacity: 10, free_seats: -3, extra_seats_in_use: 3 }), []);
const dAcima = dlg({ tipo: 'insert', acao: 'criar', nome: 'Ana', resumo: rAcima, company: assinante, podeContratar: true });
check(tem(dAcima, 'A empresa tem 13 usuários ativos para 10 vagas (10 da franquia) — já está acima da capacidade.')
  && tem(dAcima, 'faltam 4 vagas adicionais.'),
  'acima da capacidade: a frase diz quantos estão ativos e que faltam 4');
check(tem(dAcima, 'Contratar 4 vagas adicionais por R$ 17,00/mês cada (R$ 68,00/mês), a partir da próxima fatura.')
  && tem(dAcima, 'A mensalidade passa a R$ 165'),
  'e a oferta contrata as mesmas 4 (97 + 4 × 17)');
check(!tem(dAcima, 'é preciso uma vaga adicional') && !tem(dAcima, 'As 10 vagas estão em uso'),
  'sem a frase de "uma vaga" que contradizia a oferta');
check(tem(dlg({ tipo: 'insert', resumo: resumoVagas(cota({ active_users: 21, capacity: 21, extra_seats: 1 }), []), company: assinante, podeContratar: true }),
  '(20 da franquia + 1 adicional)'), 'uma adicional contratada: "1 adicional", no singular');

// O toast do caminho inline ("Contratar e criar"): com o ajuste do Mercado
// Pago pendente, ele diz que está em processamento — nada de "próxima fatura".
check(avisoVagasContratadas(1) === ' — 1 vaga adicional contratada', 'toast da contratação inline: 1 vaga adicional contratada');
check(avisoVagasContratadas(2, { pendente: true }) === ' — 2 vagas contratadas; ajuste da mensalidade em processamento',
  'ajuste pendente: o toast inline diz que a mensalidade está em processamento');
check(!avisoVagasContratadas(1, { pendente: true }).includes('próxima fatura') && avisoVagasContratadas(0, { pendente: true }) === '',
  'e não promete próxima fatura; sem contratação, sem complemento');

// ── Painel de assinatura (SubscribePanel) — primeira pintura ──
// O preço só aparece com a cota RELIDA ao abrir (efeito): antes disso, nem
// preço, nem "Nenhuma loja ativa", nem "Assinar" clicável.
const spSsr = renderToStaticMarkup(h(SubscribePanel, {
  mode: 'block', company: emTrial, currentUser: gestor, onLogout: () => {}, relerCota: async () => cota(),
}));
check(tem(spSsr, 'Conferindo as lojas e as vagas da empresa…'), 'assinatura: enquanto lê a cota, diz que está conferindo');
check(!tem(spSsr, 'Nenhuma loja ativa') && !tem(spSsr, 'vagas de usuário inclusas') && !tem(spSsr, '/mês</span>'),
  'e não mostra preço nem "Nenhuma loja ativa" sem a cota lida');
check(/<button[^>]*disabled=""[^>]*>Assinar<\/button>/.test(spSsr), 'e "Assinar" nasce desabilitado');

// 'already_subscribed' no painel que BLOQUEIA o app: lá "Plano e vagas" não
// existe — o texto manda esperar/recarregar e o suporte.
const jaAssinouBloco = checkoutError('already_subscribed', { bloqueado: true });
check(!jaAssinouBloco.includes('Plano e vagas') && jaAssinouBloco.includes('Recarregue a página') && jaAssinouBloco.includes('suporte'),
  'bloqueado + already_subscribed: sem apontar para tela inalcançável; recarregar ou suporte');
check(checkoutError('already_subscribed').includes('Plano e vagas'), 'no modal (app aberto) segue apontando para Plano e vagas');
check(checkoutError('mp_error', { bloqueado: true }) === checkoutError('mp_error'), 'os demais motivos não mudam com o modo');

// ── 7. Remover/adiar loja que estouraria a capacidade (regra 12) ────────────
console.log('\n═══ remover ou adiar loja ═══');
// 2 lojas ativas = 20 vagas, 0 adicionais. Sem uma loja, sobram 10.
const loja = { id: 'ibr2', name: 'IBR2', timezone: 'America/Sao_Paulo', activeFrom: null };
const onze = Array.from({ length: 11 }, (_, i) => ({ id: `o${i}`, name: `Onze ${i}`, role: 'colaborador', unitId: 'ibr1', pin: '0000' }));
const dez = onze.slice(0, 10);
// O em-uso é o do banco: as cotas abaixo trazem os ativos de cada cenário.
const c11 = (extra = {}) => cota({ active_users: 11, free_seats: 9, ...extra });
const bloqueio = bloqueioDeLoja(c11(), onze, loja);
check(!!bloqueio && bloqueio.endsWith('Suspenda usuários ou contrate vagas antes.'),
  '11 ativos e a loja removida deixaria 10 vagas: bloqueia com a frase da regra');
check(bloqueioDeLoja(cota({ active_users: 10 }), dez, loja) === null, '10 ativos cabem na franquia de 1 loja: passa');
check(bloqueioDeLoja(c11({ extra_seats: 1, capacity: 21 }), onze, loja) === null, 'com 1 adicional contratada, 11 cabem: passa');
check(!!bloqueioDeLoja(c11(), onze, loja, '2999-01-01'), 'adiar a ativação para o futuro é o mesmo que tirar a loja: bloqueia');
check(bloqueioDeLoja(c11(), onze, loja, '') === null, 'manter a loja ativa (data em branco) passa');
check(bloqueioDeLoja(c11(), onze, { ...loja, activeFrom: '2999-01-01' }) === null,
  'loja que ainda não estreou não conta hoje: removê-la não muda a franquia');
check(bloqueioDeLoja(c11({ exempt: true }), onze, loja) === null, 'conta isenta nunca bloqueia');
check(bloqueioDeLoja(null, onze, loja) === null, 'sem cota não inventa bloqueio');
// Gerência remove loja, mas não suspende nem contrata: o bloqueio diz a quem pedir.
const lojaGer = renderToStaticMarkup(h(LojaBloqueadaDialogo, { titulo: 'Loja com usuários demais', texto: bloqueio, onAbrirPlano: null, onClose: () => {} }));
check(tem(lojaGer, 'peça a ela') && !tem(lojaGer, 'Contratar vagas'), 'gerência: sem "Contratar vagas", e com a quem pedir');

// A trava decide com a cota RELIDA do banco — o banco não trava loja, então
// esta é a única trava da regra, e a cota da tela da gerência é a do login.
// 2 lojas, 0 adicionais: sem uma delas, 10 vagas.
const cotaLoja = (ativos) => cota({ active_users: ativos, free_seats: 20 - ativos });
let lidas = 0;
const reler = (q) => async () => { lidas += 1; return q; };
check(!!(await bloqueioDeLojaNoBanco({ reler: reler(cotaLoja(12)), cotaDaTela: cotaLoja(9), users: [], unidade: loja })),
  'tela diz 9 ativos (segunda-feira), banco diz 12 (aprovações da semana): BLOQUEIA');
check((await bloqueioDeLojaNoBanco({ reler: reler(cotaLoja(9)), cotaDaTela: cotaLoja(12), users: [], unidade: loja })) === null,
  'tela diz 12, banco diz 9 (suspensões em outro aparelho): passa');
check(!!(await bloqueioDeLojaNoBanco({ reler: async () => null, cotaDaTela: cotaLoja(12), users: [], unidade: loja })),
  'leitura que falha (null) cai na cota da tela');
check(!!(await bloqueioDeLojaNoBanco({ reler: async () => { throw new Error('rede'); }, cotaDaTela: cotaLoja(12), users: [], unidade: loja })),
  'leitura que estoura também cai na cota da tela');
check(!!(await bloqueioDeLojaNoBanco({ reler: reler(cotaLoja(12)), cotaDaTela: cotaLoja(9), users: [], unidade: loja, novaAtivaDesde: '2999-01-01' })),
  'adiar a ativação também decide com a cota relida');
lidas = 0;
check((await bloqueioDeLojaNoBanco({ reler: reler(cotaLoja(12)), cotaDaTela: cotaLoja(12), users: [], unidade: loja, novaAtivaDesde: '' })) === null && lidas === 0,
  'mudança que não tira a loja da contagem (renomear, data em branco) nem vai ao banco');
check(lojaSaiDaContagem(loja) && !lojaSaiDaContagem({ ...loja, activeFrom: '2999-01-01' }) && !lojaSaiDaContagem(loja, ''),
  'lojaSaiDaContagem: remover a ativa sai; a que não estreou e a que segue ativa não');

// ── 8. Na tela montada (jsdom): releitura e foco ────────────────────────────
console.log('\n═══ tela montada: releitura da cota e foco ═══');
const { JSDOM } = await import('jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="r"></div></body></html>', { url: 'https://loja.test/app' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// Depois do DOM: o react-dom/client olha `window` ao carregar.
const { createRoot } = await import('react-dom/client');
const doc = dom.window.document;
const esperar = async (ms = 20) => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); };
const clicar = async (el) => { await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }); await esperar(); };
const botao = (t) => [...doc.querySelectorAll('button')].find(b => b.textContent.trim() === t);
const botaoRotulo = (t) => doc.querySelector(`button[aria-label="${t}"]`);
const textoTela = () => doc.body.textContent;
let root = null;
const montar = async (el) => {
  if (root) await act(async () => { root.unmount(); });
  root = createRoot(doc.getElementById('r'));
  await act(async () => { root.render(el); });
  await esperar();
};

// ── Assinatura: o valor é o do checkoutPlan do servidor, lido na hora ──
// A tela achava 1 loja (cota do login); agora são 3 lojas ativas e 4 vagas
// adicionais em uso — é isso que o servidor cobra.
const cotaAgora = cota({ active_users: 34, active_units: 3, included_seats: 30, capacity: 30, free_seats: -4, extra_seats_in_use: 4 });
const cobrado = (cycle) => checkoutPlan({ requestedUnits: 1, cycle, quota: cotaAgora, account: { extra_seats: 0 } }).amount;
let soltar;
await montar(h(SubscribePanel, {
  mode: 'modal', company: emTrial, currentUser: gestor, onClose: () => {},
  relerCota: () => new Promise(r => { soltar = r; }),
}));
check(textoTela().includes('Conferindo as lojas e as vagas da empresa') && botao('Assinar')?.disabled === true,
  'assinatura: com a leitura em curso, sem preço e "Assinar" desabilitado');
await act(async () => { soltar(cotaAgora); });
await esperar();
check(textoTela().includes(`${formatBRL(cobrado('annual'))}/mês`) && formatBRL(cobrado('annual')) === 'R$ 359',
  'depois da leitura: R$ 359 no anual — o MESMO valor do checkoutPlan do servidor (3 lojas + 4 vagas)');
check(botao('Assinar')?.disabled === false, 'e "Assinar" libera');
await clicar([...doc.querySelectorAll('button')].find(b => b.textContent.startsWith('Mensal')));
check(textoTela().includes(`${formatBRL(cobrado('monthly'))}/mês`), `no mensal também bate com o servidor (${formatBRL(cobrado('monthly'))})`);

let falhar = true;
await montar(h(SubscribePanel, {
  mode: 'block', company: emTrial, currentUser: gestor, onLogout: () => {},
  relerCota: async () => (falhar ? null : cotaAgora),
}));
check(textoTela().includes('Não foi possível conferir as lojas e as vagas da empresa agora') && botao('Assinar')?.disabled === true,
  'leitura que falha: erro, e "Assinar" desabilitado');
check(!textoTela().includes('Nenhuma loja ativa') && !textoTela().includes('/mês'),
  'e nada do preço de 1 loja nem de "Nenhuma loja ativa" (seria inventado)');
falhar = false;
await clicar(botao('Tentar de novo'));
check(textoTela().includes(`${formatBRL(cobrado('annual'))}/mês`) && botao('Assinar')?.disabled === false,
  '"Tentar de novo" relê e mostra o valor do servidor');

// ── Plano e vagas: o foco nunca fica num botão `disabled` ──
const cotaPV = (extras) => cota({ active_users: 5, extra_seats: extras, capacity: 20 + extras, free_seats: 15 + extras });
function Casca({ inicial, recarregada, salvarVagas, onClose = () => {} }) {
  const [q, setQ] = useState(inicial);
  return h(PlanoVagas, {
    quota: q, users: [], company: assinante, currentUser: gestor, onClose, onSaved: () => {}, salvarVagas,
    onRecarregar: async () => { const nova = recarregada(); if (nova) setQ(nova); return nova; },
  });
}
let noBanco = cotaPV(2);
let fechou = false;
await montar(h(Casca, {
  inicial: cotaPV(2), recarregada: () => noBanco, onClose: () => { fechou = true; },
  salvarVagas: async () => ({ ok: false, reason: 'stale', current: 3 }),
}));
await clicar(botaoRotulo('Mais uma vaga adicional'));
const salvarBtn = botao('Salvar vagas');
// Enquanto isso, outra sessão contratou até 3 — o número que esta pedia.
noBanco = cotaPV(3);
await act(async () => { salvarBtn.focus(); });
await clicar(salvarBtn);
const salvarDepois = botao('Salvar vagas');
check(textoTela().includes('agora são 3'), "'stale': o erro diz o número de agora");
check(salvarDepois === salvarBtn && doc.activeElement === salvarBtn && !salvarBtn.disabled && salvarBtn.getAttribute('aria-disabled') === 'true',
  "depois do 'stale' (nada mais a mudar), o foco segue em Salvar — aria-disabled, não `disabled`");
await act(async () => { doc.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
check(fechou, 'e o Esc, que mora no painel, ainda fecha a folha');

// Descer até o mínimo com o "−" focado: o botão chega ao limite sob o foco.
await montar(h(Casca, {
  inicial: cota({ extra_seats: 5, capacity: 25, active_users: 23, extra_seats_in_use: 3 }),
  recarregada: () => null, salvarVagas: async () => ({ ok: true }),
}));
const menos = botaoRotulo('Menos uma vaga adicional');
await act(async () => { menos.focus(); });
await clicar(menos); await clicar(menos); await clicar(menos);
check(doc.activeElement === menos && !menos.disabled && menos.getAttribute('aria-disabled') === 'true',
  'no mínimo, o "−" focado fica aria-disabled — o foco não cai no body');
check(doc.querySelector('[role="group"] span')?.textContent.trim() === '3', 'e o clique além do mínimo não desce (a guarda é o clique)');

// Folha aberta sem cota ("Fechar" focado) que recebe a cota da releitura: o
// "Fechar" sai da tela e o foco inicial é refeito dentro do painel.
// Primeiro, com a releitura também falhando: a folha fica em "Fechar".
await montar(h(Casca, { inicial: null, recarregada: () => null, salvarVagas: async () => ({ ok: true }) }));
check(doc.activeElement === botao('Fechar') && textoTela().includes('Não foi possível carregar as vagas'),
  'sem cota, o foco abre em "Fechar"');
// Agora a releitura do abrir TRAZ a cota: a mesma folha passa de "Fechar"
// (focado) para a folha inteira — o botão focado sai da tela.
await montar(h(Casca, { inicial: null, recarregada: () => cotaPV(0), salvarVagas: async () => ({ ok: true }) }));
const painelPV = doc.querySelector('[role="dialog"]');
check(!!botaoRotulo('Mais uma vaga adicional') && doc.activeElement === botaoRotulo('Mais uma vaga adicional') && painelPV.contains(doc.activeElement),
  'a cota chega com a folha aberta: o foco vai para o stepper, dentro do painel');

// ── A confirmação PAGA não abre com o foco em "Contratar e criar" ──
// (O jsdom não transforma Enter em clique; o que se afirma é onde o foco
// está — num navegador, Enter com o foco no botão É o clique.)
await montar(h(SemVagaDialogo, {
  tipo: 'insert', acao: 'criar', nome: 'Nova', resumo: rCheio, company: assinante, podeContratar: true,
  onContratar: async () => null, onClose: () => {},
}));
const painelPago = doc.querySelector('[role="dialog"]');
check(doc.activeElement === painelPago && doc.activeElement !== botao('Contratar e criar'),
  'confirmação paga: o foco abre no painel (o título é anunciado), não no botão que cobra');
await montar(h(SemVagaDialogo, { tipo: 'reactivate', nome: 'Ana', resumo: rCheio, company: assinante, podeContratar: true, onAbrirPlano: () => {}, onClose: () => {} }));
check(doc.activeElement === botao('Contratar vagas'), 'o bloqueio de reativação (não cobra) segue com o foco em "Contratar vagas"');

await act(async () => { root.unmount(); });
await rm(dir, { recursive: true, force: true });
console.log(ok ? '\n  ✅ PASSOU' : '\n  ❌ FALHOU');
process.exit(ok ? 0 : 1);
