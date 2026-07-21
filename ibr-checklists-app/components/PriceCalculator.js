'use client';

import { useState } from 'react';
import { C, R, W, T } from '../lib/tokens';
import { PRICE_BANDS, MAX_SELF_SERVICE_UNITS, priceForUnits, bandForUnits } from '../lib/plans';

// Calculadora pública de preço: arraste o slider (ou digite) e a conta aparece
// na hora — preço por loja na faixa, fatura mensal, anual e a economia. É a
// materialização da premissa de transparência: ninguém precisa de reunião
// comercial para saber quanto custa, em nenhum tamanho de rede — a faixa 21+
// é pública como as outras. A tabela de faixas é renderizada aqui (e não na
// página) para destacar a faixa ativa conforme a conta muda.

const brl = (n) => `R$ ${n.toLocaleString('pt-BR')}`;

const SLIDER_MAX = 30; // o input numérico aceita mais; o slider cobre o comum

export default function PriceCalculator() {
  const [units, setUnits] = useState(3);
  const [cycle, setCycle] = useState('monthly'); // 'monthly' | 'annual'

  const p = priceForUnits(units, cycle);
  const band = bandForUnits(units);
  const annual = cycle === 'annual';

  // Micro-feedback quando a quantidade cruza uma faixa de desconto.
  const bandNote = (() => {
    if (!band || band.min === 1) return null;
    const per = annual ? band.perUnitAnnual : band.perUnit;
    return `A partir da ${band.min}ª loja, todas as suas lojas passam a pagar ${brl(per)}.`;
  })();

  const setUnitsSafe = (v) => {
    const n = Math.round(Number(v));
    if (Number.isFinite(n)) setUnits(Math.min(MAX_SELF_SERVICE_UNITS, Math.max(1, n)));
  };

  const toggleBtn = (active) => ({
    padding: '9px 18px', borderRadius: R.pill, fontSize: T.bodySm, fontWeight: W.semibold,
    cursor: 'pointer', border: `1.5px solid ${active ? C.ink : C.border}`,
    background: active ? C.ink : 'white', color: active ? 'white' : C.muted,
  });

  return (
    <div>
      <div style={{ background: 'white', border: `1.5px solid ${C.border}`, borderRadius: R.lg, padding: 28, maxWidth: 680, margin: '0 auto' }}>
        {/* Ciclo */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 24 }} role="group" aria-label="Ciclo de cobrança">
          <button type="button" style={toggleBtn(!annual)} aria-pressed={!annual} onClick={() => setCycle('monthly')}>
            Mensal
          </button>
          <button type="button" style={toggleBtn(annual)} aria-pressed={annual} onClick={() => setCycle('annual')}>
            Anual <span style={{ fontWeight: W.medium, opacity: annual ? 0.85 : 1 }}>· 2 meses grátis</span>
          </button>
        </div>

        {/* Quantidade */}
        <label htmlFor="calc-lojas" style={{ display: 'block', fontSize: T.label, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted, marginBottom: 10 }}>
          Quantas lojas você tem?
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 6 }}>
          <input
            id="calc-lojas" type="range" min={1} max={SLIDER_MAX} step={1}
            value={Math.min(units, SLIDER_MAX)}
            onChange={e => setUnitsSafe(e.target.value)}
            aria-valuetext={`${units} ${units === 1 ? 'loja' : 'lojas'}`}
            style={{ flex: 1, accentColor: C.ink, cursor: 'pointer' }}
          />
          <input
            type="number" min={1} max={MAX_SELF_SERVICE_UNITS} value={units}
            onChange={e => setUnitsSafe(e.target.value)}
            aria-label="Número de lojas"
            style={{ width: 72, textAlign: 'center', fontSize: T.bodyLg, fontWeight: W.bold, color: C.ink,
              padding: '10px 8px', border: `1.5px solid ${C.border}`, borderRadius: R.sm, background: 'white' }}
          />
        </div>

        {/* Resultado — aria-live anuncia a conta para leitores de tela */}
        <div aria-live="polite">
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'center', gap: '8px 14px', marginTop: 18, textAlign: 'center' }}>
            <span style={{ fontSize: 38, fontWeight: W.bold, letterSpacing: '-0.02em', color: C.ink }}>
              {brl(annual ? p.perUnitAnnual : p.perUnit)}
            </span>
            <span style={{ fontSize: T.body, color: C.muted }}>por loja/mês</span>
          </div>
          <p style={{ textAlign: 'center', fontSize: T.body, color: C.ink, fontWeight: W.semibold, marginTop: 6 }}>
            {units} {units === 1 ? 'loja' : 'lojas'} × {brl(annual ? p.perUnitAnnual : p.perUnit)} ={' '}
            {brl(annual ? p.annualMonthlyEq : p.monthlyTotal)}/mês
          </p>
          {/* Percentual padronizado em ≈17% (2 meses grátis); o valor exato em
              reais ao lado é o que varia com o arredondamento por faixa. */}
          <p style={{ textAlign: 'center', fontSize: T.caption, color: C.muted, marginTop: 4 }}>
            {annual
              ? <>Cobrança anual de {brl(p.annualTotal)} — você economiza {brl(p.annualSavings)} por ano (≈17% de desconto sobre o mensal).</>
              : <>No anual sairia {brl(p.annualMonthlyEq)}/mês ({brl(p.annualTotal)}/ano) — economia de {brl(p.annualSavings)} (≈17% de desconto).</>}
          </p>
          {/* Benefício do anual, desde 1 loja: implantação assistida inclusa. */}
          <p style={{ textAlign: 'center', fontSize: T.caption, fontWeight: W.semibold, color: annual ? C.success : C.muted, marginTop: 8 }}>
            {annual
              ? '✓ Implantação assistida incluída — a gente configura sua operação com você.'
              : 'No anual, a implantação assistida vai incluída — para qualquer número de lojas.'}
          </p>
          {bandNote && (
            <p style={{ textAlign: 'center', fontSize: T.caption, fontWeight: W.semibold, color: C.success, marginTop: 10 }}>
              {bandNote}
            </p>
          )}
        </div>
      </div>

      {/* Tabela de faixas — completa e pública, inclusive 21+; a faixa da conta
          atual ganha destaque, ligando calculadora e tabela. */}
      <div className="lp-grid-5" style={{ marginTop: 32 }} aria-live="polite">
        {PRICE_BANDS.map(b => {
          const active = band?.id === b.id;
          return (
            <div key={b.id} style={{
              position: 'relative',
              background: active ? 'white' : C.bg,
              border: active ? `1.5px solid ${C.ink}` : `1px solid ${C.border}`,
              borderRadius: R.md, padding: 20,
            }}>
              {active && (
                <span style={{ position: 'absolute', top: 12, right: 12, fontSize: 10, fontWeight: W.bold, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.success }}>
                  sua faixa
                </span>
              )}
              <p style={{ fontSize: T.bodySm, fontWeight: W.semibold, color: C.ink, marginBottom: 6 }}>
                {b.max === Infinity ? `${b.min}+ lojas` : b.min === b.max ? `${b.min} loja` : `${b.min}–${b.max} lojas`}
              </p>
              <p style={{ fontSize: 26, fontWeight: W.bold, letterSpacing: '-0.02em', color: C.ink }}>
                R$ {b.perUnit}<span style={{ fontSize: T.caption, fontWeight: W.medium, color: C.muted }}> /loja/mês</span>
              </p>
              <p style={{ fontSize: T.caption, color: C.muted, marginTop: 4 }}>
                R$ {b.perUnitAnnual}/loja/mês no anual
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
