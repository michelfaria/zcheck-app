'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { C, R, W, T } from '../lib/tokens';
import {
  PRICE_PER_UNIT, ANNUAL_DISCOUNT_LABEL, MAX_SELF_SERVICE_UNITS, MAX_SELF_SERVICE_EXTRA_SEATS,
  INCLUDED_USERS_PER_UNIT, EXTRA_USER_PRICE, includedSeatsFor, extraSeatsInUse, priceForUnits, formatBRL,
} from '../lib/plans';

// Widget de preço da landing: preço por loja com 10 usuários inclusos, toggle
// Mensal/Anual com o ANUAL pré-selecionado (herói, selo −24%) e a linha
// dinâmica "Tenho X lojas e Y usuários" mostrando o total mensal nos dois
// planos + a economia do anual. Sucinto e visual — a hierarquia (preço grande,
// selo, bullets curtos) conta a história.
//
// A conta é a MESMA do checkout: `priceForUnits(lojas, ciclo, vagas adicionais)`
// com as adicionais = `extraSeatsInUse(usuários, lojas)`. Nada de refazer a
// multiplicação aqui — se a calculadora e o Mercado Pago discordarem de um
// centavo, "preço público, sem surpresa" vira mentira.
//
// O −24% e o "por dia" valem SÓ para o preço da loja: a vaga adicional custa
// R$ 17,00 nos dois planos, então o desconto sobre o TOTAL encolhe quando há
// vaga adicional. Por isso o selo e a legenda dizem "loja", e a vaga aparece
// dentro do card, colada no preço.

// ── Config (edite em lib/plans.js, não aqui) ────────────────────────────────
const ANUAL = PRICE_PER_UNIT.annual;    // por loja/mês · 12 meses no cartão
const MENSAL = PRICE_PER_UNIT.monthly;  // por loja/mês · sem fidelidade
// Espaço inseparável entre "R$" e o número (o comum deixava o "R$" sozinho no
// fim da linha). Todo valor da calculadora passa por aqui.
const brl = (v, o) => formatBRL(v, o).replace('R$ ', 'R$\u00A0');
const VAGA = brl(EXTRA_USER_PRICE, { cents: true }); // 'R$ 17,00'
const DESCONTO = ANNUAL_DISCOUNT_LABEL.replace(/^[−-]\s*/, ''); // '−24%' → '24%'
// Teto "menos de R$ X por dia" do anual: mês comercial de 30 dias, arredondado
// para cima na dezena de centavos e SEMPRE acima do valor real (97/30 = 3,23 →
// 3,30) — "menos de" nunca pode empatar. Conta em centavos para o ponto
// flutuante não decidir o arredondamento.
const POR_DIA_ANUAL = (Math.floor((ANUAL * 100) / 30 / 10) + 1) / 10;
const BULLETS = [
  `${INCLUDED_USERS_PER_UNIT} usuários inclusos por loja`,
  'Checklists ilimitados',
  'Fotos como evidência',
  'Funciona offline',
  'Painel com as prioridades do dia',
  'Biblioteca de modelos prontos',
];

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

const stepBtn = (disabled) => ({
  width: 34, height: 34, borderRadius: R.sm, border: `1.5px solid ${C.border}`,
  background: 'white', fontSize: 18, fontWeight: W.bold,
  color: disabled ? C.border : C.ink, cursor: disabled ? 'default' : 'pointer',
});

// Uma linha "Tenho [−] 2 [+] lojas" / "e [−] 20 [+] usuários". Fica FORA do
// componente de propósito: declarada dentro do render, cada tecla viraria um
// componente novo, o React remontaria o <input> e o campo perderia o foco a
// cada dígito. Rótulos das pontas com largura fixa para os dois steppers
// ficarem na mesma coluna.
function StepRow({ before, after, minusLabel, plusLabel, canMinus, canPlus, onMinus, onPlus, children }) {
  return (
    // Rótulos e vão encolhem com a tela: a 320px, 64px fixos de cada lado
    // empurravam "usuários" 3px para fora do viewport (WCAG 1.4.10).
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'clamp(6px, 2.5vw, 12px)' }}>
      <p style={{ fontSize: T.bodySm, fontWeight: W.semibold, color: C.ink, minWidth: 'clamp(48px, 16vw, 64px)' }}>{before}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" aria-label={minusLabel} disabled={!canMinus} style={stepBtn(!canMinus)} onClick={onMinus}>−</button>
        {children}
        <button type="button" aria-label={plusLabel} disabled={!canPlus} style={stepBtn(!canPlus)} onClick={onPlus}>+</button>
      </div>
      <p style={{ fontSize: T.bodySm, fontWeight: W.semibold, color: C.ink, minWidth: 'clamp(48px, 16vw, 64px)', textAlign: 'right' }}>{after}</p>
    </div>
  );
}

export default function PriceCalculator() {
  const [cycle, setCycle] = useState('annual'); // anual pré-selecionado
  // Começa em 1 loja e 10 usuários (a franquia de 1 loja): o caso mais comum
  // e o preço de entrada. Qualquer mudança nos steppers ou no campo refaz a
  // conta no mesmo render — o total acompanha na hora.
  const [units, setUnits] = useState(1);
  // Texto do campo de usuários. `null` = o visitante ainda não mexeu, e o
  // campo acompanha a franquia (10 × lojas): quem só troca o número de lojas
  // não pode ver vaga adicional surgir do nada. Guardar o TEXTO (e não o
  // número) deixa apagar e redigitar "35" sem o campo pular para 1 no meio.
  const [usersText, setUsersText] = useState(null);

  const annual = cycle === 'annual';
  const perUnit = annual ? ANUAL : MENSAL;

  const included = includedSeatsFor(units);
  // Teto do self-service: acima de franquia + 200 adicionais é conversa
  // comercial — o mesmo limite que POST /api/billing/seats aplica.
  const maxUsers = included + MAX_SELF_SERVICE_EXTRA_SEATS;
  const typed = usersText == null || usersText === '' ? included : Number(usersText);
  const users = Math.min(maxUsers, Math.max(1, Math.floor(typed) || 1));
  const extras = extraSeatsInUse(users, units);
  const priceAnual = priceForUnits(units, 'annual', extras);
  const priceMensal = priceForUnits(units, 'monthly', extras);

  const setUnitsSafe = (v) => {
    const n = Math.round(Number(v));
    if (Number.isFinite(n)) setUnits(Math.min(MAX_SELF_SERVICE_UNITS, Math.max(1, n)));
  };
  const setUsersSafe = (n) => setUsersText(String(Math.min(maxUsers, Math.max(1, n))));

  const toggleBtn = (active) => ({
    position: 'relative', padding: '9px 18px', borderRadius: R.pill, fontSize: T.bodySm,
    fontWeight: W.semibold, cursor: 'pointer',
    border: `1.5px solid ${active ? C.ink : C.border}`,
    background: active ? C.ink : 'white', color: active ? 'white' : C.muted,
  });

  return (
    <div style={{ maxWidth: 460, margin: '0 auto' }}>
      {/* Toggle — anual primeiro e pré-selecionado */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 20 }} role="group" aria-label="Plano">
        {/* aria-label: sem ele o leitor de tela lia "Anual−24%", colado. */}
        <button type="button" style={toggleBtn(annual)} aria-pressed={annual} aria-label={`Anual, ${DESCONTO} de desconto na loja`} onClick={() => setCycle('annual')}>
          Anual
          <span style={{ marginLeft: 6, fontSize: 10, fontWeight: W.bold, background: annual ? C.success : C.bg, color: annual ? 'white' : C.success, borderRadius: R.pill, padding: '2px 7px', verticalAlign: 'middle' }}>
            {ANNUAL_DISCOUNT_LABEL}
          </span>
        </button>
        <button type="button" style={toggleBtn(!annual)} aria-pressed={!annual} onClick={() => setCycle('monthly')}>
          Mensal
        </button>
      </div>

      {/* Card único */}
      <div style={{ position: 'relative', background: 'white', border: `1.5px solid ${annual ? C.ink : C.border}`, borderRadius: R.lg, padding: '28px 28px 24px', textAlign: 'center' }}>
        {annual && (
          <span style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', fontSize: T.label, fontWeight: W.bold, textTransform: 'uppercase', letterSpacing: '0.06em', background: C.success, color: 'white', borderRadius: R.pill, padding: '4px 14px', whiteSpace: 'nowrap' }}>
            Economize {DESCONTO} em cada loja
          </span>
        )}
        <div aria-live="polite">
          <p style={{ fontSize: 54, fontWeight: W.bold, letterSpacing: '-0.03em', color: C.ink, lineHeight: 1 }}>
            {brl(perUnit)}
          </p>
          <p style={{ fontSize: T.body, color: C.muted, marginTop: 6 }}>por loja/mês</p>
          <p style={{ fontSize: T.caption, color: annual ? C.success : C.muted, fontWeight: W.semibold, marginTop: 4 }}>
            {annual
              ? `menos de ${brl(POR_DIA_ANUAL, { cents: true })} por dia, por loja`
              : `no anual sai por ${brl(ANUAL)}/loja`}
          </p>
        </div>
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8, margin: '20px auto 0', maxWidth: 280, textAlign: 'left' }}>
          {BULLETS.map(b => (
            <li key={b} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Check size={14} color={C.success} aria-hidden style={{ flexShrink: 0 }} />
              <span style={{ fontSize: T.bodySm, color: C.ink, fontWeight: W.medium }}>{b}</span>
            </li>
          ))}
        </ul>
        {/* A vaga adicional mora DENTRO do card, junto do preço: é o outro
            componente da conta, não letra miúda. */}
        <p style={{ fontSize: T.caption, color: C.muted, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
          Vaga de usuário adicional: <strong style={{ color: C.ink }}>{VAGA}/mês</strong>, igual no anual e no mensal.
        </p>
        {/* A saída antecipada do anual custa a diferença para o mensal (Termos,
            seção 7). Mora aqui, junto do preço anual, porque "sem taxa
            escondida" só é verdade se nenhum custo morar só nos Termos. */}
        {annual && (
          <p style={{ fontSize: T.caption, color: C.muted, marginTop: 8 }}>
            Compromisso de 12 meses. Se sair antes, você paga só a diferença para o mensal
            ({brl(MENSAL - ANUAL)}/loja por mês usado), sem multa.
          </p>
        )}
      </div>

      {/* Linha dinâmica: Tenho X lojas e Y usuários */}
      <div style={{ marginTop: 16, background: C.bg, border: `1px solid ${C.border}`, borderRadius: R.md, padding: '14px 18px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <StepRow before="Tenho" after={units === 1 ? 'loja' : 'lojas'}
            minusLabel="Menos uma loja" plusLabel="Mais uma loja"
            canMinus={units > 1} canPlus={units < MAX_SELF_SERVICE_UNITS}
            onMinus={() => setUnitsSafe(units - 1)} onPlus={() => setUnitsSafe(units + 1)}>
            <span style={{ fontSize: T.bodyLg, fontWeight: W.bold, color: C.ink, minWidth: 44, textAlign: 'center' }}>{units}</span>
          </StepRow>
          <StepRow before="e" after={users === 1 ? 'usuário' : 'usuários'}
            minusLabel="Menos um usuário" plusLabel="Mais um usuário"
            canMinus={users > 1} canPlus={users < maxUsers}
            onMinus={() => setUsersSafe(users - 1)} onPlus={() => setUsersSafe(users + 1)}>
            {/* Campo digitável: com 3 lojas e 45 pessoas, 15 toques no "+"
                seria castigo. Ao sair do campo, normaliza para o valor usado
                na conta (1..teto). */}
            <input type="text" inputMode="numeric" pattern="[0-9]*" aria-label="Número de usuários"
              value={usersText ?? String(included)}
              onChange={(e) => setUsersText(e.target.value.replace(/\D/g, '').slice(0, 4))}
              onBlur={() => setUsersText(String(users))}
              style={{ width: 44, height: 34, fontSize: T.bodyLg, fontWeight: W.bold, color: C.ink, textAlign: 'center', background: 'white', border: `1.5px solid ${C.borderStrong}`, borderRadius: R.sm, padding: 0 }} />
          </StepRow>
        </div>
        <div aria-live="polite" style={{ marginTop: 12, textAlign: 'center' }}>
          <p style={{ fontSize: T.caption, color: C.muted, marginBottom: 4 }}>
            {plural(included, 'usuário incluso', 'usuários inclusos')}
            {extras > 0 && <> + {plural(extras, 'vaga adicional', 'vagas adicionais')} <span style={{ whiteSpace: 'nowrap' }}>× {VAGA}</span></>}
          </p>
          <p style={{ fontSize: T.bodySm, color: C.ink }}>
            <strong>Anual:</strong> {brl(priceAnual.monthlyCharge)}/mês
            <span style={{ color: C.muted }}> · </span>
            <strong>Mensal:</strong> {brl(priceMensal.monthlyCharge)}/mês
          </p>
          {/* A economia é a diferença entre os dois totais × 12 e acompanha as
              LOJAS na hora. Não muda com usuários porque a vaga adicional custa o
              mesmo nos dois planos — dito na tela, senão parece conta travada. */}
          <p style={{ fontSize: T.caption, fontWeight: W.semibold, color: C.success, marginTop: 4 }}>
            No anual você economiza {brl(priceAnual.savingsPerYear)} por ano
            {extras > 0 ? <span style={{ fontWeight: W.medium, color: C.muted }}>. A vaga adicional custa igual nos dois planos.</span> : '.'}
          </p>
        </div>
      </div>
    </div>
  );
}
