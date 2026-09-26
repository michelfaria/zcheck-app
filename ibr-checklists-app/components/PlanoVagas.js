'use client';

/**
 * ZCheck — vagas de usuário na tela: o medidor da aba Usuários, a folha
 * "Plano e vagas" e os diálogos de "sem vaga livre".
 *
 * A regra (23/09/2026, decisão do Michel — ver o cabeçalho de lib/plans.js):
 * cada loja ativa inclui 10 vagas, somadas na empresa; ocupa vaga todo usuário
 * NÃO suspenso; vaga adicional custa R$ 17,00/mês nos dois ciclos; a fatura
 * segue as vagas CONTRATADAS; a franquia nunca é reduzível e as adicionais não
 * descem abaixo das que estão em uso.
 *
 * Quem trava de verdade é o banco (trigger `users_seat_quota`). Esta tela só
 * lê a cota (`company_user_quota()`, via fetchUserQuota) para mostrar o
 * número e perguntar ANTES de salvar. Cota nula = migration ausente ou leitura
 * que falhou: nada aqui aparece nem trava — inventar um limite bloquearia
 * gente de verdade por um número que ninguém mediu.
 *
 * REGRA: como components/painel/shared.js, este módulo não importa de `app/`.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, Minus, Plus, Users } from 'lucide-react';
import { C, R, W, T } from '../lib/tokens';
import {
  formatBRL, priceForUnits, includedSeatsFor, seatCapacity, billingState,
  EXTRA_USER_PRICE, INCLUDED_USERS_PER_UNIT, MAX_SELF_SERVICE_EXTRA_SEATS,
} from '../lib/plans';
import { setExtraSeats } from '../lib/sync';
// "Loja ativa" é a do relógio da loja (units.timezone), nunca UTC nem o fuso
// de quem abriu a tela — a mesma regra que o banco usa em active_unit_count().
import { todayStr, tzOf } from '../lib/dates';
import { unitActiveOn } from '../lib/checklists';
import { useTravaRolagem } from '../lib/useTravaRolagem';

// O preço da vaga aparece SEMPRE com centavos ("R$ 17,00"): é o número que a
// pessoa confere na fatura, e "R$ 17" ao lado de "R$ 85,00" parece erro.
const VAGA = formatBRL(EXTRA_USER_PRICE, { cents: true });

const inteiro = (v) => Math.max(0, Math.floor(Number(v) || 0));
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/* ───────────────────────────── contas puras ───────────────────────────── */

/**
 * O retrato das vagas que a tela desenha, ou null sem cota.
 *
 * TUDO vem da cota do banco — capacidade, franquia (ele conta as lojas ativas
 * no fuso de cada uma) e também o "em uso". A lista da tela é carregada uma
 * vez no login e não acompanha suspensões e cadastros feitos em outro
 * aparelho: contar por ela fazia o medidor dizer "20 de 20" com uma vaga livre
 * no banco, e a confirmação oferecia contratar (e cobrar) uma vaga que não
 * fazia falta. A cota é relida ao abrir a aba, depois de todo save de usuário
 * e antes de qualquer confirmação de contratação. No banco a conta é por
 * linha de `users`: gerente de várias lojas e diretoria de "todas as lojas"
 * ocupam UMA vaga, suspenso não ocupa. A lista só serve se a cota vier sem o
 * número (cota parcial).
 */
export function resumoVagas(quota, users) {
  if (!quota) return null;
  const lojas = inteiro(quota.active_units);
  const franquia = inteiro(quota.included_seats) || includedSeatsFor(lojas);
  const extras = inteiro(quota.extra_seats);
  const capacidade = inteiro(quota.capacity) || seatCapacity(lojas, extras);
  const lista = Array.isArray(users) && users.length ? users : null;
  const emUso = quota.active_users != null
    ? inteiro(quota.active_users)
    : lista ? lista.filter(u => !u.suspended).length : 0;
  return {
    isenta: quota.exempt === true,
    lojas, franquia, extras, capacidade, emUso,
    livres: capacidade - emUso,                 // negativo = acima da capacidade
    extrasEmUso: Math.max(0, emUso - franquia), // mínimo para reduzir
  };
}

/**
 * Regra 12: remover uma loja — ou adiar a ativação dela para o futuro — tira
 * 10 vagas da franquia. Se os usuários ativos passariam da capacidade, é
 * bloqueio: "Suspenda usuários ou contrate vagas antes." Devolve o texto do
 * bloqueio, ou null quando pode seguir.
 *
 * `novaAtivaDesde` undefined = remoção; string = a data nova de "Ativa desde"
 * ('' = sempre ativa). Loja que HOJE não conta (ainda não estreou, no relógio
 * dela — lib/dates.js) não muda a franquia e passa sempre, assim como a que
 * continua ativa hoje com a data nova. Sem cota ou empresa isenta, passa: o
 * banco não trava loja, e inventar número aqui bloquearia à toa.
 */
export function bloqueioDeLoja(quota, users, unidade, novaAtivaDesde) {
  const r = resumoVagas(quota, users);
  if (!r || r.isenta || !lojaSaiDaContagem(unidade, novaAtivaDesde)) return null;
  const lojas = Math.max(0, r.lojas - 1);
  const capacidade = seatCapacity(lojas, r.extras);
  if (r.emUso <= capacidade) return null;
  return `Sem ${unidade.name} entre as lojas ativas, a franquia cai para ${includedSeatsFor(lojas)} vagas `
    + `(${capacidade} com as adicionais contratadas) e há ${r.emUso} usuários ativos. `
    + 'Suspenda usuários ou contrate vagas antes.';
}

/**
 * A mudança tira a loja da contagem de HOJE (no relógio dela)? Remoção
 * (`novaAtivaDesde` undefined) tira a loja que hoje conta; "Ativa desde" novo
 * tira só se a loja conta hoje e deixa de contar com a data nova. Só aí a
 * franquia cai — renomear, trocar cor, fuso ou CNPJ nunca mexe em vaga.
 */
export function lojaSaiDaContagem(unidade, novaAtivaDesde) {
  if (!unidade) return false;
  const hoje = todayStr(tzOf(unidade));
  if (!unitActiveOn(unidade, hoje)) return false;
  if (novaAtivaDesde !== undefined && unitActiveOn({ ...unidade, activeFrom: novaAtivaDesde || null }, hoje)) return false;
  return true;
}

/**
 * Regra 12 decidida com a cota RELIDA do banco. O banco não trava loja (o
 * único trigger é o de `users`), então esta conta é a única trava da regra — e
 * a cota da tela é do login ou do último save: a gerência que abriu o app na
 * segunda e remove uma loja na sexta decidiria pelos ativos de segunda (três
 * aprovações no meio da semana passariam direto; suspensões feitas em outro
 * aparelho bloqueariam à toa). `reler()` devolve a cota de agora, ou null se a
 * leitura falhou — aí vale a da tela, que é melhor do que nenhuma. Mudança que
 * não tira a loja da contagem nem vai ao banco.
 */
export async function bloqueioDeLojaNoBanco({ reler, cotaDaTela = null, users, unidade, novaAtivaDesde }) {
  if (!lojaSaiDaContagem(unidade, novaAtivaDesde)) return null;
  let fresca = null;
  try { fresca = await reler?.(); } catch { fresca = null; }
  return bloqueioDeLoja(fresca || cotaDaTela, users, unidade, novaAtivaDesde);
}

/** "20 da franquia (2 lojas × 10)". Com 0 lojas ativas vale o piso de 1 loja. */
function textoFranquia(r) {
  const base = r.lojas >= 1 ? plural(r.lojas, 'loja', 'lojas') : 'mínimo de 1 loja';
  return `${r.franquia} da franquia (${base} × ${INCLUDED_USERS_PER_UNIT})`;
}

/**
 * A linha do medidor, num texto só — "Vagas: 23 de 25 em uso · 20 da franquia
 * (2 lojas × 10) + 5 adicionais contratadas (R$ 85,00/mês)". Um texto só
 * também porque o teste de renderização procura a frase inteira.
 */
export function textoMedidor(r) {
  const extras = r.extras
    ? ` + ${r.extras} ${r.extras === 1 ? 'adicional contratada' : 'adicionais contratadas'} (${formatBRL(r.extras * EXTRA_USER_PRICE, { cents: true })}/mês)`
    : '';
  return `Vagas: ${r.emUso} de ${r.capacidade} em uso · ${textoFranquia(r)}${extras}`;
}

/** Ciclo da assinatura para a conta do total. Sem plano conhecido, anual (o herói). */
export function cicloDaEmpresa(company) {
  if (company?.plan_tier === 'mensal') return { cycle: 'monthly', conhecido: true };
  if (company?.plan_tier === 'anual') return { cycle: 'annual', conhecido: true };
  return { cycle: 'annual', conhecido: false };
}

/** No teste nada é cobrado: a vaga contratada passa a valer na assinatura. */
export const emTeste = (company) => billingState(company).state === 'trialing';

/**
 * Quando uma mudança de vagas pesa na fatura — a frase que acompanha todo
 * preço destas telas. "Próxima fatura" só existe com assinatura ATIVA no MP:
 *   'teste'          → nada é cobrado agora; entra no valor da assinatura;
 *   'assinatura'     → vale a partir da próxima fatura, sem pró-rata;
 *   'sem_assinatura' → cancelada (mesmo dentro do período pago), em atraso ou
 *                      legado: não há próxima fatura a prometer — as vagas
 *                      entram no valor da próxima assinatura.
 */
export function momentoCobranca(company) {
  if (emTeste(company)) return 'teste';
  return company?.subscription_status === 'active' ? 'assinatura' : 'sem_assinatura';
}

/**
 * A frase do toast depois de salvar vagas. Com `pending` (ajuste automático no
 * Mercado Pago desligado, ou que falhou) o valor da assinatura ainda NÃO
 * mudou: prometer "vale a partir da próxima fatura" seria dizer que o cartão
 * vai ver um número que ninguém aplicou — o ajuste está com a equipe ZCheck
 * (alerta R8 no Core).
 */
export function mensagemVagasSalvas(res, momento) {
  if (res?.pending) return 'Vagas atualizadas — o ajuste da mensalidade está em processamento.';
  if (momento === 'teste') return 'Vagas atualizadas — cobradas a partir da assinatura.';
  if (momento === 'sem_assinatura') return 'Vagas atualizadas — entram na próxima assinatura.';
  return 'Vagas atualizadas — vale a partir da próxima fatura.';
}

/**
 * O complemento do toast "Usuário criado" / "Cadastro aprovado" quando o save
 * contratou vagas no caminho (a confirmação "Contratar e criar"). A mesma
 * regra de `mensagemVagasSalvas`: com `pendente` o valor da assinatura NÃO
 * mudou no Mercado Pago (ajuste automático desligado, ou que falhou) — o toast
 * diz que o ajuste está em processamento, e não deixa de pé o "a mensalidade
 * passa a" que a confirmação mostrou. Curto: o toast é uma linha só.
 */
export function avisoVagasContratadas(n, { pendente = false } = {}) {
  if (!n) return '';
  if (pendente) return ` — ${n === 1 ? '1 vaga contratada' : `${n} vagas contratadas`}; ajuste da mensalidade em processamento`;
  return ` — ${n === 1 ? '1 vaga adicional contratada' : `${n} vagas adicionais contratadas`}`;
}

/** Motivo devolvido por setExtraSeats → frase para a tela. */
export function erroVagas(reason, min, atual = null) {
  switch (reason) {
    case 'forbidden':
      return 'Só a diretoria pode contratar ou reduzir vagas.';
    case 'stale':
      return atual != null
        ? `As vagas adicionais contratadas mudaram em outra sessão — agora são ${atual}. Confira o número e confirme de novo.`
        : 'As vagas adicionais contratadas mudaram em outra sessão. Confira o número e confirme de novo.';
    case 'below_in_use':
      return min != null
        ? `Não dá para ficar com menos de ${plural(min, 'vaga adicional', 'vagas adicionais')}: ${min === 1 ? 'ela está em uso' : 'elas estão em uso'}. Para reduzir mais, suspenda usuários antes.`
        : 'Não dá para reduzir abaixo das vagas adicionais em uso. Para reduzir mais, suspenda usuários antes.';
    case 'invalid_seats':
      return `Número de vagas inválido — escolha de 0 a ${MAX_SELF_SERVICE_EXTRA_SEATS} vagas adicionais.`;
    case 'unauthorized':
      return 'Sessão expirada. Entre novamente para mudar as vagas.';
    case 'network':
      return 'Sem conexão. Verifique a internet e tente de novo.';
    default:
      return 'Não foi possível salvar as vagas agora. Tente de novo.';
  }
}

/* ─────────────────────────────── diálogo ──────────────────────────────── */

/**
 * A folha de baixo que o app já usa (DisputeSheet, AvatarPickerModal,
 * conferência): fundo azul translúcido, painel branco colado embaixo no
 * celular e centralizado no desktop por `.zc-sheet`/`.zc-sheet-panel`
 * (globals.css). O que ela acrescenta é o que um diálogo de COBRANÇA não pode
 * dispensar: título que nomeia o diálogo para o leitor de tela, foco inicial
 * em `focoRef` — ou no próprio painel, que anuncia o título, quando não há
 * `focoRef` — e de volta a quem abriu ao fechar, Esc fecha e o Tab não escapa
 * para a tela de trás.
 *
 * A INVARIANTE: o foco nunca pode cair no <body> com a folha aberta — Esc e a
 * trava do Tab moram no painel. Por isso nenhum botão destas folhas usa
 * `disabled` (o botão focado que vira `disabled` joga o foco no body; aqui é
 * `aria-disabled` + a guarda no clique), e `focoChave` refaz o foco inicial
 * quando o conteúdo troca por inteiro (a folha que abriu "carregando" e
 * recebeu a cota: o botão focado sai da tela e leva o foco junto).
 *
 * zIndex 320: acima da barra de ação fixa dos editores (90) e da navegação,
 * abaixo do toast global (400) — o "Vagas atualizadas" tem de aparecer por cima.
 *
 * `margin: 0`: a folha nasce dentro do `.space-y-3` da aba Usuários e do
 * `.space-y-4` das Unidades, cuja margem desceria o overlay. A página atrás
 * fica travada enquanto ela está aberta (`useTravaRolagem`).
 */
export function FolhaDialogo({ titulo, onClose, busy = false, focoRef, focoChave, children }) {
  const painelRef = useRef(null);
  const tituloId = useId();
  useTravaRolagem();

  // Quem abriu recebe o foco de volta ao fechar.
  useEffect(() => {
    const quemAbriu = typeof document !== 'undefined' ? document.activeElement : null;
    return () => {
      if (quemAbriu && typeof quemAbriu.focus === 'function' && document.contains(quemAbriu)) quemAbriu.focus();
    };
  }, []);

  // Foco inicial, e de novo a cada troca de conteúdo — mas só se o foco não
  // está mais dentro do painel: quem já está num botão da folha fica onde está.
  useEffect(() => {
    const painel = painelRef.current;
    if (!painel) return;
    const ativo = document.activeElement;
    if (ativo && ativo !== painel && painel.contains(ativo)) return;
    // Botão desabilitado não recebe foco: aí o foco vai para o painel, e o
    // leitor de tela anuncia o título do diálogo.
    const alvo = focoRef?.current && !focoRef.current.disabled ? focoRef.current : painel;
    alvo.focus?.();
  }, [focoRef, focoChave]);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (!busy) onClose?.();
      return;
    }
    if (e.key !== 'Tab' || !painelRef.current) return;
    const focaveis = [...painelRef.current.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )];
    if (!focaveis.length) { e.preventDefault(); return; }
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    const ativo = document.activeElement;
    if (e.shiftKey && (ativo === primeiro || ativo === painelRef.current)) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && ativo === ultimo) { e.preventDefault(); primeiro.focus(); }
  };

  return (
    <div className="zc-sheet" onClick={busy ? undefined : onClose}
      style={{ position: 'fixed', inset: 0, margin: 0, zIndex: 320, background: 'rgba(11,60,92,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      {/* tabIndex -1: clicar num texto do painel põe o foco NO painel (e não
          no body), e o Esc continua chegando aqui. */}
      <div ref={painelRef} className="w-full zc-sheet-panel"
        role="dialog" aria-modal="true" aria-labelledby={tituloId} tabIndex={-1}
        onKeyDown={onKeyDown} onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480, background: 'white', borderRadius: '20px 20px 0 0',
          padding: '24px 24px 40px', paddingBottom: 'calc(40px + env(safe-area-inset-bottom, 0px))',
          maxHeight: '90vh', overflowY: 'auto', outline: 'none',
        }}>
        <h2 id={tituloId} className="font-display"
          style={{ fontWeight: W.semibold, fontSize: 'calc(17px * var(--zc-t-scale))', color: C.ink }}>
          {titulo}
        </h2>
        {children}
      </div>
    </div>
  );
}

// Botões das folhas — os mesmos da DisputeSheet/AvatarPickerModal: primário
// cheio de largura inteira, secundário discreto embaixo. Desabilitado vira
// cinza (e não só mais claro): "Salvar vagas" sem mudança não pode parecer
// clicável. Branco sobre `muted` dá 5.2:1 — segue AA.
const btnPrimario = (busy, desabilitado = false) => ({
  width: '100%', padding: '12px 16px', marginTop: 16, borderRadius: 10, border: 'none',
  background: desabilitado ? C.muted : C.ink, color: 'white', fontWeight: W.semibold, fontSize: 15,
  cursor: busy || desabilitado ? 'default' : 'pointer', opacity: busy ? 0.7 : 1,
});
const btnSecundario = {
  width: '100%', padding: '10px 16px', marginTop: 6, borderRadius: 10, border: 'none',
  background: 'none', color: C.muted, fontWeight: W.semibold, fontSize: 13, cursor: 'pointer',
};
const pTexto = { fontSize: T.bodySm, color: C.ink, lineHeight: 1.55, marginTop: 10 };
const pNota = { fontSize: T.caption, color: C.muted, lineHeight: 1.5, marginTop: 8 };

/* ─────────────────────────────── medidor ──────────────────────────────── */

/**
 * Medidor da aba Usuários. Conta a EMPRESA, não a loja do cabeçalho: a
 * franquia é somada, e "3 de 10" com a IBR2 selecionada mentiria sobre quantas
 * vagas sobram. Sem cota → nada. Isenta → só a frase da cortesia.
 */
export function VagasMedidor({ quota, users, podeContratar = false, onAbrirPlano }) {
  const r = resumoVagas(quota, users);
  if (!r) return null;
  if (r.isenta) {
    return (
      <p style={{ fontSize: 12, color: C.muted, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Users size={13} aria-hidden /> Conta cortesia — sem limite de vagas
      </p>
    );
  }
  const acima = r.livres < 0;
  const cheio = r.livres === 0;
  const cor = acima ? C.critical : cheio ? C.warning : C.success;
  const pct = Math.min(100, Math.round((r.emUso / Math.max(1, r.capacidade)) * 100));
  // Acima da capacidade (loja removida ou desativada): criar alguém ainda é
  // possível contratando as vagas que faltam; reativar, não — por isso a frase
  // diz o que fazer, e não que "tudo fica bloqueado".
  const situacao = acima
    ? `${plural(-r.livres, 'usuário', 'usuários')} acima da capacidade — para criar ou reativar alguém, ${podeContratar ? 'contrate vagas ou suspenda usuários' : 'peça à diretoria para contratar vagas ou suspender usuários'}.`
    : cheio
      ? `Nenhuma vaga livre — ${podeContratar ? `o próximo usuário contrata 1 vaga adicional de ${VAGA}/mês` : 'peça à diretoria para contratar vagas'}.`
      : `${plural(r.livres, 'vaga livre', 'vagas livres')} · quem está suspenso não ocupa vaga`;

  return (
    <div style={{ background: 'white', border: `1px solid ${acima ? C.critical : C.border}`, borderRadius: R.md, padding: '10px 12px' }}>
      <p style={{ fontSize: T.caption, fontWeight: W.semibold, color: C.ink, lineHeight: 1.45 }}>{textoMedidor(r)}</p>
      {/* A barra só repete o texto — o número escrito é a fonte. */}
      <div aria-hidden="true" style={{ height: 6, borderRadius: R.pill, background: C.border, marginTop: 8, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: cor, borderRadius: R.pill }} />
      </div>
      <p style={{ fontSize: 12, color: acima ? C.critical : cheio ? C.warning : C.muted, marginTop: 6, lineHeight: 1.45, display: 'flex', alignItems: 'flex-start', gap: 5 }}>
        {(acima || cheio) && <AlertTriangle size={13} aria-hidden style={{ flexShrink: 0, marginTop: 1 }} />}
        <span>{situacao}</span>
      </p>
      {onAbrirPlano && (
        <button type="button" onClick={onAbrirPlano}
          style={{ marginTop: 8, padding: '7px 12px', borderRadius: R.sm, border: `1px solid ${C.borderStrong}`, background: 'white', color: C.ink, fontWeight: W.semibold, fontSize: 12.5, cursor: 'pointer' }}>
          Plano e vagas
        </button>
      )}
    </div>
  );
}

/* ───────────────────────────── sem vaga livre ──────────────────────────── */

/**
 * O que a tela faz quando a pessoa não cabe.
 *
 *   · tipo 'insert' (usuário novo, aprovar cadastro): CONFIRMAÇÃO na hora —
 *     "Contratar 1 vaga adicional por R$ 17,00/mês?" → contrata → salva. Só a
 *     diretoria contrata; os demais recebem "peça à diretoria".
 *   · tipo 'reactivate': BLOQUEIO, sem contratação embutida. O caso típico é
 *     A suspenso, B entrou no lugar, reativar A: a vaga de A já é de B, e a
 *     decisão de pagar por mais uma merece a tela inteira de Plano e vagas, não
 *     um "ok" no meio de uma edição.
 *
 * `resumo` pode faltar (cota não lida, recusa que veio do banco): os números
 * saem do detalhe do erro, e sem eles o texto fica sem números.
 * `onContratar(faltam)` devolve a frase de erro, ou null quando deu certo (aí
 * quem chamou fecha o diálogo e segue salvando).
 */
export function SemVagaDialogo({ tipo, nome, resumo, detalhe, company, podeContratar, acao = 'criar', onContratar, onAbrirPlano, onClose }) {
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const focoRef = useRef(null);

  // Recusa do banco (`detalhe`) com a tela ainda achando vaga livre: a tela é
  // que está velha (a releitura da cota chega logo depois) — vale o número de
  // quem recusou. Senão, a cota da tela, que é do banco e é relida a cada save.
  const usarDetalhe = detalhe?.active != null && detalhe?.capacity != null && (!resumo || resumo.livres >= 1);
  const emUso = usarDetalhe ? inteiro(detalhe.active) : resumo?.emUso ?? null;
  const capacidade = usarDetalhe ? inteiro(detalhe.capacity) : resumo?.capacidade ?? null;
  const temNumeros = emUso != null && capacidade != null;
  const faltam = temNumeros ? Math.max(1, emUso + 1 - capacidade) : 1;
  const momento = momentoCobranca(company);
  const quem = nome ? `"${nome}"` : 'este usuário';

  if (tipo === 'reactivate') {
    return (
      <FolhaDialogo titulo="Sem vaga para reativar" onClose={onClose} focoRef={focoRef}>
        <p style={pTexto}>
          {/* "O acesso de X" e não "X está suspenso/a": o nome não diz o gênero.
              E sem dizer POR QUE a vaga acabou: pode ter sido gente nova, loja
              removida ou vagas reduzidas depois da suspensão. */}
          {`O acesso de ${nome || 'este usuário'} está suspenso, e não há vaga livre agora${temNumeros ? `: ${emUso} de ${capacidade} vagas em uso` : ''}. Reativar exige uma vaga livre.`}
        </p>
        {podeContratar && onAbrirPlano ? (
          <>
            <p style={pNota}>
              Contrate vagas em Plano e vagas — ou suspenda alguém que não usa mais o app — e salve de novo.
            </p>
            <button ref={focoRef} type="button" onClick={onAbrirPlano} style={btnPrimario(false)}>
              Contratar vagas
            </button>
            <button type="button" onClick={onClose} style={btnSecundario}>Cancelar</button>
          </>
        ) : (
          <>
            <p style={pNota}>Sem vaga livre — peça à diretoria para contratar vagas.</p>
            <button ref={focoRef} type="button" onClick={onClose} style={btnPrimario(false)}>Entendi</button>
          </>
        )}
      </FolhaDialogo>
    );
  }

  if (!podeContratar) {
    return (
      <FolhaDialogo titulo="Sem vaga livre" onClose={onClose} focoRef={focoRef}>
        <p style={pTexto}>Sem vaga livre — peça à diretoria para contratar vagas.</p>
        {temNumeros && <p style={pNota}>{`${emUso} de ${capacidade} vagas em uso.`}</p>}
        <button ref={focoRef} type="button" onClick={onClose} style={btnPrimario(false)}>Entendi</button>
      </FolhaDialogo>
    );
  }

  // O efeito na fatura, dito antes do clique: quanto, desde quando. No teste
  // não há fatura — a vaga passa a ser cobrada quando a assinatura começar; sem
  // assinatura ativa (cancelada, em atraso), entra na próxima assinatura.
  const quando = momento === 'teste'
    ? (faltam === 1 ? 'cobrada a partir da assinatura' : 'cobradas a partir da assinatura')
    : momento === 'sem_assinatura'
      ? (faltam === 1 ? 'cobrada a partir da próxima assinatura' : 'cobradas a partir da próxima assinatura')
      : 'a partir da próxima fatura';
  const oferta = faltam === 1
    ? `Contratar 1 vaga adicional por ${VAGA}/mês, ${quando}.`
    : `Contratar ${faltam} vagas adicionais por ${VAGA}/mês cada (${formatBRL(faltam * EXTRA_USER_PRICE, { cents: true })}/mês), ${quando}.`;
  // Novo total só com assinatura ATIVA e ciclo conhecido: no teste (ou sem
  // plano) o número dependeria de um plano que a pessoa ainda não escolheu, e
  // sem assinatura ativa não há mensalidade a "passar a" nada.
  const { cycle, conhecido } = cicloDaEmpresa(company);
  const novoTotal = resumo && conhecido && momento === 'assinatura'
    ? priceForUnits(resumo.lojas, cycle, resumo.extras + faltam).monthlyCharge
    : null;

  const confirmar = async () => {
    if (busy) return;
    setBusy(true); setErro('');
    const msg = await onContratar?.(faltam);
    // Deu certo: quem chamou já fechou o diálogo. O setBusy vale mesmo assim —
    // se o save seguinte for recusado de novo e o diálogo reabrir no mesmo
    // lugar, ele não pode nascer preso em "Contratando…".
    setBusy(false);
    if (msg) setErro(msg);
  };

  // A primeira frase tem de bater com o número que a oferta contrata. Acima da
  // capacidade (loja removida, vagas reduzidas) faltam MAIS de uma: dizer "as
  // 10 vagas estão em uso… é preciso uma vaga adicional" e embaixo contratar 4
  // é consentimento de cobrança com texto contraditório.
  const verbo = acao === 'aprovar' ? 'aprovar' : 'criar';
  const composicao = resumo && !usarDetalhe
    ? ` (${resumo.franquia} da franquia${resumo.extras ? ` + ${resumo.extras} ${resumo.extras === 1 ? 'adicional' : 'adicionais'}` : ''})`
    : '';
  const situacao = temNumeros && emUso > capacidade
    ? `A empresa tem ${plural(emUso, 'usuário ativo', 'usuários ativos')} para ${plural(capacidade, 'vaga', 'vagas')}${composicao} — já está acima da capacidade. Para ${verbo} ${quem}, ${faltam === 1 ? 'falta' : 'faltam'} ${plural(faltam, 'vaga adicional', 'vagas adicionais')}.`
    : temNumeros && emUso === capacidade
      ? `As ${capacidade} vagas estão em uso${composicao}. Para ${verbo} ${quem}, é preciso uma vaga adicional.`
      // Sem números, ou com a tela achando vaga livre e o banco recusando
      // sem o detalhe: vale a palavra do banco, sem número inventado.
      : `Todas as vagas estão em uso. Para ${verbo} ${quem}, é preciso uma vaga adicional.`;

  // Sem `focoRef`: o foco abre no PAINEL (o leitor de tela anuncia o título),
  // nunca em "Contratar e criar". O diálogo chega depois de uma ida ao banco
  // disparada por um Enter em "Salvar usuário" — e o segundo Enter de quem
  // achou que nada aconteceu contrataria uma vaga paga sem o texto ter sido
  // lido. Do painel, o Tab leva ao botão.
  return (
    <FolhaDialogo titulo="Sem vaga livre" onClose={onClose} busy={busy}>
      <p style={pTexto}>{situacao}</p>
      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: R.sm, padding: '10px 12px', marginTop: 12 }}>
        <p style={{ fontSize: T.bodySm, fontWeight: W.semibold, color: C.ink, lineHeight: 1.5 }}>{oferta}</p>
        {novoTotal != null && (
          <p style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
            {`A mensalidade passa a ${formatBRL(novoTotal)}. Dá para reduzir depois em Plano e vagas.`}
          </p>
        )}
      </div>
      {erro && <p role="alert" style={{ fontSize: 13, color: C.critical, marginTop: 10 }}>{erro}</p>}
      {/* aria-disabled, e não `disabled`, enquanto contrata: o botão focado
          que vira `disabled` perde o foco para o <body>, e aí o Esc e a trava
          do Tab (que moram no painel) param de funcionar justamente quando a
          contratação falha e o erro aparece. */}
      <button type="button" onClick={confirmar} aria-disabled={busy || undefined} style={btnPrimario(busy)}>
        {busy ? 'Contratando…' : `Contratar e ${verbo}`}
      </button>
      <button type="button" onClick={busy ? undefined : onClose} aria-disabled={busy || undefined} style={btnSecundario}>Cancelar</button>
    </FolhaDialogo>
  );
}

/**
 * Remover ou adiar a ativação de uma loja que deixaria mais usuários ativos do
 * que vagas: a loja leva 10 vagas da franquia com ela. Bloqueio, como na
 * reativação — a saída é suspender usuários ou contratar vagas ANTES. O texto
 * (com os números) vem de quem conta, `unitSeatBlock` no AppInner.
 */
export function LojaBloqueadaDialogo({ titulo, texto, onAbrirPlano, onClose }) {
  const focoRef = useRef(null);
  return (
    <FolhaDialogo titulo={titulo} onClose={onClose} focoRef={focoRef}>
      <p style={pTexto}>{texto}</p>
      {onAbrirPlano ? (
        <>
          <button ref={focoRef} type="button" onClick={onAbrirPlano} style={btnPrimario(false)}>Contratar vagas</button>
          <button type="button" onClick={onClose} style={btnSecundario}>Cancelar</button>
        </>
      ) : (
        <>
          {/* Sem "Contratar vagas" é a gerência: ela remove loja, mas não
              suspende usuários nem contrata — dizer a quem pedir. */}
          <p style={pNota}>Quem suspende usuários e contrata vagas é a diretoria — peça a ela.</p>
          <button ref={focoRef} type="button" onClick={onClose} style={btnPrimario(false)}>Entendi</button>
        </>
      )}
    </FolhaDialogo>
  );
}

/* ──────────────────────────── Plano e vagas ───────────────────────────── */

function Linha({ rotulo, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontSize: T.caption, color: C.muted, flexShrink: 0 }}>{rotulo}</span>
      <span style={{ fontSize: T.caption, fontWeight: W.semibold, color: C.ink, textAlign: 'right' }}>{children}</span>
    </div>
  );
}

const btnPasso = (off) => ({
  width: 40, height: 40, borderRadius: R.sm, border: `1.5px solid ${off ? C.border : C.borderStrong}`,
  background: 'white', color: off ? C.border : C.ink, cursor: off ? 'default' : 'pointer',
  display: 'grid', placeItems: 'center', flexShrink: 0,
});

/**
 * "Plano e vagas": onde a diretoria contrata ou reduz vagas ADICIONAIS.
 *
 * A franquia aparece fixa e dita "não reduzíveis" — 2 lojas são 20 vagas, não
 * existe "19". O stepper não desce abaixo das adicionais EM USO (ativos −
 * franquia): abaixo disso alguém ficaria sem vaga, e a saída é suspender
 * antes. O servidor confere de novo (409 below_in_use com o mínimo dele), e o
 * mínimo que ele devolve passa a valer aqui.
 *
 * Aberta pelo medidor da aba Usuários, pelo bloqueio de reativação e pelo
 * cabeçalho da diretoria. `onSaved(res, mensagem)` recebe a resposta da rota
 * (com a cota nova) e a frase de confirmação para o toast. `onRecarregar()`
 * relê a cota no banco (e devolve a nova): a folha a chama ao abrir — a cota
 * da tela pode ser de antes de outra sessão mexer nas vagas — e quando a rota
 * responde 'stale'. O salvar manda o número contratado que a folha VIU
 * (`expected`): se mudou no meio, a rota recusa em vez de sobrescrever.
 */
export default function PlanoVagas({ quota, users, company, currentUser, onClose, onSaved, onRecarregar, salvarVagas = setExtraSeats }) {
  const r = resumoVagas(quota, users);
  const podeMudar = currentUser?.role === 'gestao';
  const [minimoServidor, setMinimoServidor] = useState(0);
  const minimo = Math.max(r?.extrasEmUso ?? 0, minimoServidor);
  // Começa no contratado — ou já no mínimo, quando a empresa está acima da
  // capacidade (loja removida): aí salvar é justamente contratar o que falta.
  const semente = (x) => Math.max(x?.extras ?? 0, x?.extrasEmUso ?? 0);
  const [extras, setExtras] = useState(() => semente(r));
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const focoRef = useRef(null);
  const dicaId = useId();
  // A pessoa já mexeu no número: a releitura não o troca por baixo dela.
  const mexeu = useRef(false);
  // A folha pode abrir sem cota ("Não foi possível carregar") e recebê-la da
  // releitura: o "Fechar" focado some, e o foco inicial tem de ser refeito.
  const fase = !r ? 'sem_cota' : r.isenta ? 'isenta' : 'plano';

  // Relê ao abrir e, se ninguém mexeu ainda, recomeça do número de agora.
  useEffect(() => {
    if (!onRecarregar) return undefined;
    let vivo = true;
    Promise.resolve(onRecarregar()).then(q => {
      const f = resumoVagas(q, users);
      if (vivo && f && !mexeu.current) setExtras(semente(f));
    }).catch(() => {});
    return () => { vivo = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!r) {
    return (
      <FolhaDialogo titulo="Plano e vagas" onClose={onClose} focoRef={focoRef} focoChave={fase}>
        <p style={pTexto}>Não foi possível carregar as vagas agora. Verifique a conexão e tente de novo.</p>
        <button ref={focoRef} type="button" onClick={onClose} style={btnPrimario(false)}>Fechar</button>
      </FolhaDialogo>
    );
  }
  if (r.isenta) {
    return (
      <FolhaDialogo titulo="Plano e vagas" onClose={onClose} focoRef={focoRef} focoChave={fase}>
        <p style={pTexto}>Conta cortesia — sem limite de vagas. Não há vagas a contratar.</p>
        <p style={pNota}>{`${plural(r.emUso, 'usuário ativo', 'usuários ativos')} hoje.`}</p>
        <button ref={focoRef} type="button" onClick={onClose} style={btnPrimario(false)}>Fechar</button>
      </FolhaDialogo>
    );
  }

  const momento = momentoCobranca(company);
  const { cycle, conhecido } = cicloDaEmpresa(company);
  const preco = priceForUnits(r.lojas, cycle, extras);
  const capacidadeNova = r.franquia + extras;
  const mudou = extras !== r.extras;
  const podeMenos = podeMudar && extras > minimo && !busy;
  const podeMais = podeMudar && extras < MAX_SELF_SERVICE_EXTRA_SEATS && !busy;
  const passo = (delta) => {
    // Os botões do stepper são aria-disabled (nunca `disabled` — ver
    // FolhaDialogo): quem barra o clique no limite é esta guarda.
    if (delta < 0 ? !podeMenos : !podeMais) return;
    mexeu.current = true;
    setExtras(e => Math.min(MAX_SELF_SERVICE_EXTRA_SEATS, Math.max(minimo, e + delta)));
  };

  const salvar = async () => {
    if (busy || !mudou) return;
    setBusy(true); setErro('');
    const res = await salvarVagas(extras, { expected: r.extras });
    if (res?.ok) {
      onSaved?.(res, mensagemVagasSalvas(res, momento));
      return;
    }
    setBusy(false);
    if (res?.reason === 'stale') {
      // Outra sessão mudou as vagas: recomeça do número de agora e pede para
      // conferir — nunca reenvia sozinho um alvo pensado sobre o número velho.
      const f = resumoVagas(await onRecarregar?.(), users);
      if (f) { mexeu.current = false; setExtras(semente(f)); }
      setErro(erroVagas('stale', null, res.current));
      return;
    }
    if (res?.reason === 'below_in_use' && res.min != null) {
      setMinimoServidor(inteiro(res.min));
      setExtras(e => Math.max(e, inteiro(res.min)));
    }
    setErro(erroVagas(res?.reason, res?.min));
  };

  return (
    <FolhaDialogo titulo="Plano e vagas" onClose={onClose} busy={busy} focoRef={focoRef} focoChave={fase}>
      <p style={pNota}>
        {`Cada loja ativa inclui ${INCLUDED_USERS_PER_UNIT} vagas de usuário, somadas na empresa. Quem está suspenso não ocupa vaga.`}
      </p>

      <div style={{ marginTop: 10 }}>
        <Linha rotulo="Lojas ativas">{r.lojas >= 1 ? r.lojas : '0 (vale o mínimo de 1 loja)'}</Linha>
        <Linha rotulo="Franquia">{`${r.franquia} vagas da franquia (${r.lojas >= 1 ? plural(r.lojas, 'loja', 'lojas') : 'mínimo de 1 loja'} × ${INCLUDED_USERS_PER_UNIT}) — não reduzíveis`}</Linha>
        <Linha rotulo="Em uso">{plural(r.emUso, 'usuário ativo', 'usuários ativos')}</Linha>
      </div>

      <p style={{ fontSize: T.label, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted, marginTop: 16 }}>
        Vagas adicionais contratadas
      </p>
      {podeMudar ? (
        <div role="group" aria-label="Vagas adicionais contratadas"
          style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          {/* aria-disabled, não `disabled`: descer até o mínimo com o "−"
              focado desabilitaria o botão sob o foco — e o foco iria para o
              <body>, levando o Esc e a trava do Tab junto. */}
          <button type="button" aria-label="Menos uma vaga adicional" aria-disabled={!podeMenos || undefined}
            onClick={() => passo(-1)} style={btnPasso(!podeMenos)}>
            <Minus size={18} aria-hidden />
          </button>
          <span aria-live="polite" style={{ fontSize: 20, fontWeight: W.bold, color: C.ink, minWidth: 32, textAlign: 'center' }}>
            {extras}
          </span>
          {/* O foco abre aqui: "Salvar" nasce aria-disabled (nada mudou
              ainda), e a primeira decisão da folha é o número. */}
          <button ref={focoRef} type="button" aria-label="Mais uma vaga adicional" aria-disabled={!podeMais || undefined}
            onClick={() => passo(1)} style={btnPasso(!podeMais)}>
            <Plus size={18} aria-hidden />
          </button>
          <span style={{ fontSize: 12, color: C.muted }}>{`${VAGA}/mês cada`}</span>
        </div>
      ) : (
        <p style={{ ...pTexto, marginTop: 6 }}>{`${r.extras} · só a diretoria contrata ou reduz vagas.`}</p>
      )}
      {podeMudar && (
        <p style={pNota}>
          {minimo > 0
            ? `Mínimo de ${minimo}: ${minimo === 1 ? 'é a vaga adicional em uso' : 'são as vagas adicionais em uso'} hoje. Para reduzir mais, suspenda usuários antes.`
            : 'Nenhuma vaga adicional em uso — dá para reduzir até 0. A franquia não entra na conta.'}
        </p>
      )}

      <p style={{ ...pNota, color: C.ink }}>
        {`Capacidade: ${capacidadeNova} vagas · ${capacidadeNova - r.emUso >= 0 ? plural(capacidadeNova - r.emUso, 'livre', 'livres') : `${r.emUso - capacidadeNova} acima`}`}
      </p>

      {/* O total é a MESMA conta do checkout e da landing (priceForUnits):
          lojas ativas × preço da loja + vagas adicionais × R$ 17,00. */}
      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: R.sm, padding: '10px 12px', marginTop: 12 }}>
        <p style={{ fontSize: T.bodySm, fontWeight: W.semibold, color: C.ink }}>
          {`${mudou ? 'Novo total mensal' : 'Total mensal'}: ${formatBRL(preco.monthlyCharge)}/mês`}
        </p>
        <p style={{ fontSize: 12, color: C.muted, marginTop: 3, lineHeight: 1.5 }}>
          {`${plural(preco.units, 'loja', 'lojas')} × ${formatBRL(preco.perUnit)}${extras ? ` + ${plural(extras, 'vaga', 'vagas')} × ${VAGA}` : ''} · ${conhecido ? '' : 'valores do '}plano ${cycle === 'annual' ? 'anual' : 'mensal'}`}
        </p>
        <p style={{ fontSize: 12, color: C.ink, marginTop: 6, fontWeight: W.semibold }}>
          {momento === 'teste'
            ? 'Nada é cobrado no teste — as vagas adicionais são cobradas a partir da assinatura.'
            : momento === 'sem_assinatura'
              ? 'Sem assinatura ativa — as vagas adicionais entram no valor da próxima assinatura.'
              : 'Vale a partir da próxima fatura, sem cobrança proporcional.'}
        </p>
      </div>

      {erro && <p role="alert" style={{ fontSize: 13, color: C.critical, marginTop: 10 }}>{erro}</p>}

      {podeMudar ? (
        <>
          {/* aria-disabled enquanto salva E quando nada mudou — nunca
              `disabled`. "Nada mudou" também acontece COM o foco aqui: a
              resposta 'stale' recomeça do número de agora (e o de agora pode
              ser justamente o que a pessoa pediu), 'below_in_use' sobe para o
              mínimo. O `disabled` jogava o foco no <body> bem na hora do erro.
              A guarda do clique é o `if (busy || !mudou)` de salvar(). */}
          <button type="button" onClick={salvar} aria-disabled={busy || !mudou || undefined}
            aria-describedby={!mudou && !busy ? dicaId : undefined} style={btnPrimario(busy, !mudou)}>
            {busy ? 'Salvando…' : 'Salvar vagas'}
          </button>
          {!mudou && !busy && (
            <p id={dicaId} style={{ ...pNota, textAlign: 'center', marginTop: 6 }}>Mude o número de vagas adicionais para salvar.</p>
          )}
          <button type="button" onClick={busy ? undefined : onClose} aria-disabled={busy || undefined} style={btnSecundario}>Fechar</button>
        </>
      ) : (
        <button ref={focoRef} type="button" onClick={onClose} style={btnPrimario(false)}>Fechar</button>
      )}
    </FolhaDialogo>
  );
}

/* ─────────────────────── aviso dos Termos (v1.2) ──────────────────────── */

// Versão dos Termos (app/termos/page.js) cuja mudança de vagas este aviso
// comunica. Nova versão dos Termos com mudança de cobrança = trocar os dois
// valores e o texto abaixo — a chave do "já vi" muda junto, e o aviso volta.
export const TERMOS_VERSAO = '1.2';
const TERMOS_DATA = '23/09/2026';

/**
 * Aviso da v1.2 dos Termos para a diretoria. A seção 10 dos Termos condiciona
 * a mudança à "notificação aos usuários pelo próprio Aplicativo", e a v1.2
 * mudou o contrato de quem começou o teste na v1.1: saiu "usuários ilimitados",
 * entrou a franquia de 10 por loja + vaga adicional, e saiu o pró-rata. Sem
 * este aviso, a 11ª pessoa seria a primeira notícia da regra.
 *
 * Uma vez por pessoa e por versão, lembrado no aparelho (localStorage). Sem
 * localStorage (aba anônima, armazenamento bloqueado) o aviso aparece de novo
 * — o lado seguro. Lido num efeito, não no render: a primeira pintura é igual
 * no servidor e no navegador.
 */
export function AvisoTermosVagas({ userId }) {
  const chave = `zc_termos_${TERMOS_VERSAO}_${userId || 'anon'}`;
  const [visivel, setVisivel] = useState(false);
  useEffect(() => {
    let visto = null;
    try { visto = localStorage.getItem(chave); } catch { /* sem armazenamento: mostra */ }
    setVisivel(!visto);
  }, [chave]);
  if (!visivel) return null;
  const fechar = () => {
    setVisivel(false);
    try { localStorage.setItem(chave, new Date().toISOString()); } catch { /* segue fechado nesta sessão */ }
  };
  return (
    <section aria-label="Termos de Uso atualizados"
      style={{ margin: '12px 16px 0', background: 'white', border: `1px solid ${C.border}`, borderRadius: R.md, padding: '12px 14px' }}>
      <p style={{ fontSize: T.bodySm, fontWeight: W.semibold, color: C.ink }}>
        {`Termos de Uso atualizados — versão ${TERMOS_VERSAO}, de ${TERMOS_DATA}`}
      </p>
      <p style={{ fontSize: T.caption, color: C.muted, lineHeight: 1.5, marginTop: 4 }}>
        {`Cada loja ativa inclui ${INCLUDED_USERS_PER_UNIT} usuários, somados na empresa. Acima disso, a diretoria contrata vagas adicionais de ${VAGA}/mês. Quem está suspenso não ocupa vaga. Mudanças de lojas e de vagas valem a partir da próxima fatura, sem cobrança proporcional.`}
      </p>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <a href="/termos" target="_blank" rel="noopener noreferrer"
          style={{ padding: '7px 12px', borderRadius: R.sm, border: `1px solid ${C.borderStrong}`, color: C.ink, fontWeight: W.semibold, fontSize: 12.5, textDecoration: 'none' }}>
          Ler os Termos
        </a>
        <button type="button" onClick={fechar}
          style={{ padding: '7px 12px', borderRadius: R.sm, border: 'none', background: C.ink, color: 'white', fontWeight: W.semibold, fontSize: 12.5, cursor: 'pointer' }}>
          Entendi
        </button>
      </div>
    </section>
  );
}
