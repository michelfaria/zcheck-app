// Fonte única dos planos de assinatura, das vagas de usuário e do estado de
// billing de uma empresa. Puro (sem segredos, sem node, SEM import) —
// importável tanto no cliente quanto no servidor, e testado direto em
// tests/plans.spec.mjs.
//
// ── Preço por loja (21/07/2026) ─────────────────────────────────────────────
// PREÇO ÚNICO POR LOJA, sem pacotes e sem "sob consulta".
//   · Anual:  R$ 97/loja/mês — cobrança MENSAL recorrente no cartão,
//     compromisso de 12 meses. É a oferta principal (herói).
//   · Mensal: R$ 127/loja/mês — sem fidelidade, cancele quando quiser.
// Nos dois planos a cobrança no MP é mensal (frequency 1); o que muda é o
// preço por loja e o compromisso. Selo do anual: −24% ((127−97)/127 ≈ 23,6%),
// e o desconto é SÓ da loja — não alcança a vaga adicional.
//
// ── Vagas de usuário (23/09/2026, decisão do Michel) ────────────────────────
//   · Cada loja ativa inclui 10 vagas, e a franquia é SOMADA na empresa:
//     1 loja = 10, 2 lojas = 20, 3 lojas = 30. Piso de 1 loja: a empresa
//     recém-criada, com 0 lojas ativas, tem 10 vagas — a gestão criada no
//     cadastro sempre cabe. Loja ativa = `units.active` e já estreou
//     (`active_from` nulo ou ≤ hoje no fuso da loja) — a MESMA contagem que
//     a cobrança usa, e quem conta é o banco (`active_unit_count()`).
//   · Ocupa vaga todo usuário NÃO suspenso, de qualquer papel. Diretoria de
//     "todas as lojas" e gerente de várias lojas ocupam 1 vaga só; pedido de
//     cadastro pendente não ocupa.
//   · Vaga adicional = vaga CONTRATADA: R$ 17,00/mês cada, igual no anual e no
//     mensal (sem o −24%).
//   · A fatura segue as vagas CONTRATADAS, não o uso. Suspender alguém libera a
//     vaga para outra pessoa, mas não baixa a fatura sozinho — quem reduz é a
//     diretoria, em "Plano e vagas".
//   · Redução só das vagas ADICIONAIS: a franquia (10 × lojas) nunca é
//     reduzível — 2 lojas são 20 vagas, não existe "reduzir para 19". E nunca
//     abaixo das adicionais EM USO (`extraSeatsInUse`): para reduzir mais,
//     suspender usuários antes. A redução vale da próxima fatura.
// Aqui mora só a CONTA. A trava de verdade é o trigger `users_seat_quota` no
// banco (migration 20260923_limite_usuarios), e as vagas contratadas vivem em
// `billing_accounts.extra_seats` — o cliente lê as duas por
// `company_user_quota()`, nunca recalcula a capacidade por conta própria.
//
// ── Por que o valor cobrado NÃO identifica o plano ──────────────────────────
// Com vaga adicional no total, valores iguais saem de planos diferentes:
// anual com 2 lojas + 11 vagas = 2×97 + 11×17 = 381 = mensal com 3 lojas.
// Por isso não existe mais o inverso "valor → lojas/ciclo": o webhook lê a
// intenção gravada no checkout (`billing_checkouts`) e o valor efetivamente
// cobrado fica em `billing_accounts.billed_amount`.

export const TRIAL_DAYS = 14;

export const PRICE_PER_UNIT = {
  annual: 97,   // por loja/mês, 12 meses no cartão
  monthly: 127, // por loja/mês, sem fidelidade
};

export const ANNUAL_DISCOUNT_LABEL = '−24%';

// Teto operacional do checkout self-service (lojas por assinatura). Acima
// disso é conversa comercial, não formulário.
export const MAX_SELF_SERVICE_UNITS = 50;

// Vagas de usuário incluídas por loja ativa — somadas na empresa.
export const INCLUDED_USERS_PER_UNIT = 10;

// R$/mês por vaga adicional contratada. O MESMO valor nos dois ciclos: o
// desconto do anual é da loja, não da vaga.
export const EXTRA_USER_PRICE = 17;

// Teto de vagas adicionais que a diretoria contrata sozinha pelo app
// (POST /api/billing/seats devolve 400 acima disso). É validação de entrada:
// `priceForUnits` NÃO corta aqui, senão o total ficaria menor que as vagas
// realmente contratadas.
export const MAX_SELF_SERVICE_EXTRA_SEATS = 200;

const normCycle = (c) => (c === 'monthly' || c === 'mensal' ? 'monthly' : 'annual');

// Inteiro ≥ 0 a partir de qualquer entrada (null, string do PostgREST, NaN,
// fração). Vaga e loja não existem pela metade.
const wholeNonNeg = (v) => Math.max(0, Math.floor(Number(v) || 0));

/**
 * Dinheiro em pt-BR para a UI: 'R$ 97', 'R$ 1.164', e com `cents: true`
 * 'R$ 17,00'. Sem `cents`, valor inteiro sai sem centavos (é assim que os
 * preços da loja aparecem desde a landing), mas valor quebrado SEMPRE mostra
 * os centavos — arredondar dinheiro na tela é mentir sobre a fatura.
 * A vaga adicional é sempre `formatBRL(EXTRA_USER_PRICE, { cents: true })`.
 *
 * Formata à mão, sem `toLocaleString`: a saída não depende do ICU de quem
 * roda (Node do servidor × navegador), então o HTML do servidor e o da
 * hidratação batem sempre. E a conta é em centavos inteiros, para ruído de
 * ponto flutuante (380.99999…) não virar "R$ 380,99" nem forçar centavos.
 */
export function formatBRL(value, { cents = false } = {}) {
  const n = Number(value) || 0;
  const totalCents = Math.round(Math.abs(n) * 100);
  const reais = String(Math.floor(totalCents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const rest = totalCents % 100;
  const withCents = cents || rest !== 0;
  const sign = n < 0 && totalCents > 0 ? '-' : '';
  return `${sign}R$ ${reais}${withCents ? `,${String(rest).padStart(2, '0')}` : ''}`;
}

/**
 * Vagas da franquia: 10 por loja ativa, somadas, com piso de 1 loja.
 * Sem teto de lojas aqui — uma empresa acima do self-service continua tendo
 * 10 vagas por loja.
 */
export function includedSeatsFor(units) {
  return INCLUDED_USERS_PER_UNIT * Math.max(1, wholeNonNeg(units));
}

/** Capacidade total de usuários ativos: franquia + vagas adicionais contratadas. */
export function seatCapacity(units, extraSeats) {
  return includedSeatsFor(units) + wholeNonNeg(extraSeats);
}

/**
 * Vagas adicionais EM USO: ativos que passam da franquia. É o mínimo para
 * reduzir as vagas contratadas — abaixo disso alguém ficaria sem vaga, então
 * a redução exige suspender usuários antes.
 */
export function extraSeatsInUse(activeUsers, units) {
  return Math.max(0, wholeNonNeg(activeUsers) - includedSeatsFor(units));
}

/**
 * Preço para `unitCount` lojas + `extraSeats` vagas adicionais no ciclo dado
 * (padrão: anual, o herói). `monthlyCharge` é o valor cobrado por mês no
 * cartão (nos DOIS planos a cobrança é mensal) = lojas × preço da loja +
 * vagas adicionais × R$ 17. `savingsPerYear` é quanto o anual economiza em 12
 * meses frente ao mensal — só sobre as lojas, porque a vaga custa o mesmo nos
 * dois ciclos. `monthlyTotal`/`chargeAmount` são aliases de compat.
 */
export function priceForUnits(unitCount, cycle = 'annual', extraSeats = 0) {
  const units = Math.min(MAX_SELF_SERVICE_UNITS, Math.max(1, Math.floor(Number(unitCount) || 1)));
  const c = normCycle(cycle);
  const perUnit = PRICE_PER_UNIT[c];
  const unitsCharge = perUnit * units;
  const extras = wholeNonNeg(extraSeats);
  const extraSeatsCharge = EXTRA_USER_PRICE * extras;
  const monthlyCharge = unitsCharge + extraSeatsCharge;
  const savingsPerYear = (PRICE_PER_UNIT.monthly - PRICE_PER_UNIT.annual) * 12 * units;
  return {
    units, cycle: c, perUnit, unitsCharge,
    includedSeats: includedSeatsFor(units), extraSeats: extras,
    extraSeatPrice: EXTRA_USER_PRICE, extraSeatsCharge,
    monthlyCharge, savingsPerYear,
    monthlyTotal: monthlyCharge, chargeAmount: monthlyCharge,
  };
}

/**
 * Valor mensal de uma assinatura (métricas/MRR). O que vale é o que o MP
 * cobra de fato: `billing_accounts.billed_amount`, gravado pelo webhook com o
 * `transaction_amount` real (já inclui as vagas adicionais). Sem esse valor
 * (conta anterior à migration, ou webhook que ainda não chegou), cai no
 * cálculo legado por `plan_tier` × `unit_limit` da linha `companies` — que só
 * conhece lojas. plan_tier desconhecido (cortesia/legado) → 0, como antes.
 */
export function monthlyValueFor(company, account) {
  const billed = Number(account?.billed_amount);
  if (billed > 0) return billed;
  const units = Number(company?.unit_limit);
  if (!(units >= 1)) return 0;
  if (company?.plan_tier === 'anual') return PRICE_PER_UNIT.annual * units;
  if (company?.plan_tier === 'mensal') return PRICE_PER_UNIT.monthly * units;
  return 0;
}

const asDate = (v) => (v ? new Date(v) : null);
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Estado de billing derivado da linha `companies`.
 * Retorna { state: 'active'|'trialing'|'expired', daysLeft, trialEndsAt, periodEnd }.
 *
 * Regra de segurança: na dúvida (empresa ausente / campos faltando), NÃO bloqueia
 * — evita travar acesso legítimo por dado incompleto. O bloqueio real é só quando
 * há sinal claro de trial vencido ou assinatura encerrada.
 */
export function billingState(company, now = Date.now()) {
  if (!company) return { state: 'active', daysLeft: null, trialEndsAt: null, periodEnd: null };

  const status = company.subscription_status || null;
  const trialEndsAt = asDate(company.trial_ends_at);
  const periodEnd = asDate(company.current_period_end);

  const trialDaysLeft = trialEndsAt
    ? Math.ceil((trialEndsAt.getTime() - now) / DAY_MS) : null;
  const periodValid = periodEnd ? periodEnd.getTime() > now : false;

  // Assinatura paga vigente (inclui cancelada mas ainda dentro do período pago).
  if ((status === 'active' || status === 'canceled') && periodValid) {
    return { state: 'active', daysLeft: null, trialEndsAt, periodEnd };
  }
  // Ativa sem período registrado ainda (recém-ativada): trata como ativa.
  if (status === 'active' && !periodEnd) {
    return { state: 'active', daysLeft: null, trialEndsAt, periodEnd };
  }
  // Trial em andamento.
  if (status === 'trialing' && trialEndsAt && trialEndsAt.getTime() > now) {
    return { state: 'trialing', daysLeft: Math.max(0, trialDaysLeft), trialEndsAt, periodEnd };
  }
  // Trial vencido, ou past_due/canceled com período já encerrado → bloqueio.
  if (status === 'trialing' || status === 'past_due' || status === 'canceled') {
    return { state: 'expired', daysLeft: 0, trialEndsAt, periodEnd };
  }
  // Status desconhecido/legado sem trial: não bloqueia.
  return { state: 'active', daysLeft: null, trialEndsAt, periodEnd };
}
