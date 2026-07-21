'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { C, R, W, T } from '../lib/tokens';
import { PRICE_PER_UNIT, ANNUAL_DISCOUNT_LABEL, MAX_SELF_SERVICE_UNITS } from '../lib/plans';

// Widget de preço da landing: preço ÚNICO por loja, toggle Mensal/Anual com o
// ANUAL pré-selecionado (herói, selo −24%) e a linha dinâmica "Tenho X lojas"
// mostrando o total mensal nos dois planos + a economia do anual. Sucinto e
// visual — a hierarquia (preço grande, selo, bullets curtos) conta a história.

// ── Config (edite aqui) ──────────────────────────────────────────────────────
const ANUAL = PRICE_PER_UNIT.annual;    // R$ 97/loja/mês · 12 meses no cartão
const MENSAL = PRICE_PER_UNIT.monthly;  // R$ 127/loja/mês · sem fidelidade
const BULLETS = [
  'Checklists ilimitados',
  'Fotos como evidência',
  'Funciona offline',
  'Briefing diário',
  'Templates por setor',
];

const brl = (n) => `R$ ${n.toLocaleString('pt-BR')}`;

export default function PriceCalculator() {
  const [cycle, setCycle] = useState('annual'); // anual pré-selecionado
  const [units, setUnits] = useState(2);

  const annual = cycle === 'annual';
  const perUnit = annual ? ANUAL : MENSAL;
  const savingsPerYear = (MENSAL - ANUAL) * 12 * units;

  const setUnitsSafe = (v) => {
    const n = Math.round(Number(v));
    if (Number.isFinite(n)) setUnits(Math.min(MAX_SELF_SERVICE_UNITS, Math.max(1, n)));
  };

  const toggleBtn = (active) => ({
    position: 'relative', padding: '9px 18px', borderRadius: R.pill, fontSize: T.bodySm,
    fontWeight: W.semibold, cursor: 'pointer',
    border: `1.5px solid ${active ? C.ink : C.border}`,
    background: active ? C.ink : 'white', color: active ? 'white' : C.muted,
  });

  const stepBtn = (disabled) => ({
    width: 34, height: 34, borderRadius: R.sm, border: `1.5px solid ${C.border}`,
    background: 'white', fontSize: 18, fontWeight: W.bold,
    color: disabled ? C.border : C.ink, cursor: disabled ? 'default' : 'pointer',
  });

  return (
    <div style={{ maxWidth: 460, margin: '0 auto' }}>
      {/* Toggle — anual primeiro e pré-selecionado */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 20 }} role="group" aria-label="Plano">
        <button type="button" style={toggleBtn(annual)} aria-pressed={annual} onClick={() => setCycle('annual')}>
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
            Economize 24%
          </span>
        )}
        <div aria-live="polite">
          <p style={{ fontSize: 54, fontWeight: W.bold, letterSpacing: '-0.03em', color: C.ink, lineHeight: 1 }}>
            {brl(perUnit)}
          </p>
          <p style={{ fontSize: T.body, color: C.muted, marginTop: 6 }}>por loja/mês</p>
          <p style={{ fontSize: T.caption, color: annual ? C.success : C.muted, fontWeight: W.semibold, marginTop: 4 }}>
            {annual ? 'menos de R$ 3,30 por dia' : `no anual sai por ${brl(ANUAL)}/loja`}
          </p>
        </div>
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8, margin: '20px auto 0', maxWidth: 240, textAlign: 'left' }}>
          {BULLETS.map(b => (
            <li key={b} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Check size={14} color={C.success} aria-hidden style={{ flexShrink: 0 }} />
              <span style={{ fontSize: T.bodySm, color: C.ink, fontWeight: W.medium }}>{b}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Linha dinâmica: Tenho X lojas */}
      <div style={{ marginTop: 16, background: C.bg, border: `1px solid ${C.border}`, borderRadius: R.md, padding: '14px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <p style={{ fontSize: T.bodySm, fontWeight: W.semibold, color: C.ink }}>Tenho</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button type="button" aria-label="Menos uma loja" disabled={units <= 1} style={stepBtn(units <= 1)}
              onClick={() => setUnitsSafe(units - 1)}>−</button>
            <span style={{ fontSize: T.bodyLg, fontWeight: W.bold, color: C.ink, minWidth: 24, textAlign: 'center' }}>{units}</span>
            <button type="button" aria-label="Mais uma loja" disabled={units >= MAX_SELF_SERVICE_UNITS} style={stepBtn(units >= MAX_SELF_SERVICE_UNITS)}
              onClick={() => setUnitsSafe(units + 1)}>+</button>
          </div>
          <p style={{ fontSize: T.bodySm, fontWeight: W.semibold, color: C.ink }}>{units === 1 ? 'loja' : 'lojas'}</p>
        </div>
        <div aria-live="polite" style={{ marginTop: 10, textAlign: 'center' }}>
          <p style={{ fontSize: T.bodySm, color: C.ink }}>
            <strong>Anual:</strong> {brl(ANUAL * units)}/mês
            <span style={{ color: C.muted }}> · </span>
            <strong>Mensal:</strong> {brl(MENSAL * units)}/mês
          </p>
          <p style={{ fontSize: T.caption, fontWeight: W.semibold, color: C.success, marginTop: 4 }}>
            No anual você economiza {brl(savingsPerYear)} por ano.
          </p>
        </div>
      </div>
    </div>
  );
}
