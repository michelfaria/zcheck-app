'use client';

/**
 * "Repetir" de uma tarefa — os quatro modos da recorrência (24/09/2026):
 *
 *   Todo dia · Semana (dias da semana) · Mês (todo dia N) · A cada N dias/semanas/meses
 *
 * Os quatro modos são só da TELA. Para a regra existem dois formatos
 * (`recurrence` e `period`, ver lib/recurrence.js), e este componente grava
 * sempre um e limpa o outro — o dado nunca sai daqui misturado.
 *
 * Usado pelo editor do checklist e pelo formulário "+ Novo" em app/app/page.js:
 * antes cada um tinha a sua cópia dos botões de dia da semana, e uma regra nova
 * em um só dos dois é exatamente como as duas telas passam a gravar coisas
 * diferentes para a mesma escolha.
 *
 * `onChange(patch)` recebe só os campos que mudam, para quem chama fazer o
 * merge no item. `hoje` é o dia no relógio DA LOJA (`todayStr(tzOf(unit))`):
 * é dele que sai o início de "todo dia N" e o default de "a partir de".
 *
 * Escolher Mês ou "A cada" liga "cobrar no dia seguinte" se estiver desligado
 * (decisão do Michel, 24/09/2026): tarefa mensal esquecida que não é cobrada
 * some até o mês seguinte. Liga só na ENTRADA do modo — quem desliga a cobrança
 * depois e troca o dia não a vê religar sozinha — e voltar para Todo dia ou
 * Semana na mesma edição desfaz o que foi ligado sozinho.
 *
 * REGRA: não importa de `app/`.
 */

import { useId, useState } from 'react';
import { C, W } from '../lib/tokens';
import {
  WEEKDAY_LABELS, PERIOD_MAX_EVERY, periodoValido, modoRecorrencia, inicioNoDiaDoMes,
  proximasOcorrencias, descreverRecorrencia, ehDataValida,
} from '../lib/recurrence';

const MODOS = [
  { id: 'diaria', label: 'Todo dia' },
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mês' },
  { id: 'intervalo', label: 'A cada…' },
];
const UNIDADES = [
  { id: 'day', um: 'dia', varios: 'dias' },
  { id: 'week', um: 'semana', varios: 'semanas' },
  { id: 'month', um: 'mês', varios: 'meses' },
];

const rotulo = { fontSize: 11, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted };
const campo = { fontSize: 13, fontWeight: W.semibold, color: C.ink, background: 'white', borderRadius: 8, border: `1.5px solid ${C.border}`, outline: 'none' };

// dd/mm, e o ano só quando não é o de hoje — "10/01/2027" diz algo que "10/01" esconde.
const dataCurta = (s, hoje) => `${s.slice(8, 10)}/${s.slice(5, 7)}${s.slice(0, 4) !== hoje.slice(0, 4) ? `/${s.slice(0, 4)}` : ''}`;

export default function RecurrenceEditor({ item, accent, hoje, onChange }) {
  const uid = useId();
  const [modo, setModo] = useState(() => modoRecorrencia(item));
  const periodo = periodoValido(item.period) ? item.period : null;
  const [everyTxt, setEveryTxt] = useState(() => String(periodo?.every ?? 2));
  // A cobrança que ESTE editor ligou sozinho. Voltar para Todo dia/Semana a
  // desliga de novo — clicar em Mês por engano não pode deixar para trás uma
  // regra que ninguém escolheu. A que o gestor ligou à mão fica como está.
  const [ligouCobranca, setLigouCobranca] = useState(false);

  const diaAtual = periodo ? Number(periodo.start.slice(8, 10)) : Number(hoje.slice(8, 10));

  const escolherModo = (m) => {
    if (m === modo) return;
    setModo(m);
    if (m === 'diaria' || m === 'semana') {
      const desfaz = ligouCobranca && item.carryover ? { carryover: false, carryoverSince: null } : {};
      setLigouCobranca(false);
      onChange(m === 'diaria' ? { recurrence: null, period: null, ...desfaz } : { period: null, ...desfaz });
      return;
    }
    let cobranca = {};
    if (!item.carryover) { cobranca = { carryover: true, carryoverSince: hoje }; setLigouCobranca(true); }
    if (m === 'mes') {
      onChange({ recurrence: null, period: { every: 1, unit: 'month', start: inicioNoDiaDoMes(diaAtual, hoje) }, ...cobranca });
    } else {
      const base = periodo || { every: 2, unit: 'week', start: hoje };
      setEveryTxt(String(base.every));
      onChange({ recurrence: null, period: { ...base }, ...cobranca });
    }
  };

  const mudarPeriodo = (campos) => {
    const p = { ...(periodo || { every: 2, unit: 'week', start: hoje }), ...campos };
    if (periodoValido(p)) onChange({ period: p });
  };

  const rec = item.recurrence || [];
  const proximas = (modo === 'mes' || modo === 'intervalo') && periodo ? proximasOcorrencias(item, hoje, 3) : [];
  const unidade = UNIDADES.find(u => u.id === periodo?.unit) || UNIDADES[1];
  const nEvery = Number(periodo?.every ?? everyTxt);

  return (
    <div>
      <p style={{ ...rotulo, marginBottom: 4 }}>{descreverRecorrencia(item)}</p>

      <div role="group" aria-label="Repetir" className="flex flex-wrap gap-1" style={{ marginBottom: 6 }}>
        {MODOS.map(m => {
          const ativo = modo === m.id;
          return (
            <button key={m.id} type="button" aria-pressed={ativo} onClick={() => escolherModo(m.id)}
              style={{
                height: 26, padding: '0 10px', borderRadius: 4, fontSize: 11, fontWeight: W.semibold,
                border: `1px solid ${ativo ? accent : C.border}`,
                background: ativo ? accent : 'white', color: ativo ? C.bg : C.muted, cursor: 'pointer',
              }}>
              {m.label}
            </button>
          );
        })}
      </div>

      {modo === 'semana' && (
        <div className="flex gap-1">
          {WEEKDAY_LABELS.map((label, day) => {
            const active = rec.includes(day);
            return (
              <button key={day} type="button" aria-pressed={active} aria-label={label}
                onClick={() => {
                  const next = active ? rec.filter(d => d !== day) : [...rec, day].sort((a, b) => a - b);
                  onChange({ recurrence: next.length ? next : null, period: null });
                }}
                style={{
                  width: 30, height: 26, borderRadius: 4, fontSize: 11, fontWeight: W.semibold,
                  border: `1px solid ${C.border}`,
                  background: active ? accent : 'white',
                  color: active ? C.bg : C.muted,
                }}>
                {label[0]}
              </button>
            );
          })}
        </div>
      )}

      {modo === 'mes' && (
        <div>
          <label htmlFor={`${uid}-dia`} className="flex items-center gap-2" style={{ fontSize: 13, color: C.ink }}>
            Todo dia
            <select id={`${uid}-dia`} value={diaAtual}
              onChange={e => onChange({ period: { every: 1, unit: 'month', start: inicioNoDiaDoMes(Number(e.target.value), hoje) } })}
              className="px-2 py-1" style={campo}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            do mês
          </label>
          {diaAtual > 28 && (
            <p style={{ marginTop: 4, fontSize: 11, color: C.muted, lineHeight: 1.4 }}>
              Em mês mais curto, cai no último dia.
            </p>
          )}
        </div>
      )}

      {modo === 'intervalo' && (
        <div className="flex flex-wrap items-center gap-2" style={{ fontSize: 13, color: C.ink }}>
          <label htmlFor={`${uid}-n`}>A cada</label>
          <input id={`${uid}-n`} type="number" inputMode="numeric" min={1} max={PERIOD_MAX_EVERY}
            value={everyTxt}
            onChange={e => {
              setEveryTxt(e.target.value);
              const n = Number(e.target.value);
              if (Number.isInteger(n) && n >= 1 && n <= PERIOD_MAX_EVERY) mudarPeriodo({ every: n });
            }}
            onBlur={() => setEveryTxt(String(periodo?.every ?? 2))}
            className="px-2 py-1" style={{ ...campo, width: 64 }} />
          <select aria-label="Unidade" value={unidade.id}
            onChange={e => mudarPeriodo({ unit: e.target.value })}
            className="px-2 py-1" style={campo}>
            {UNIDADES.map(u => <option key={u.id} value={u.id}>{nEvery === 1 ? u.um : u.varios}</option>)}
          </select>
          <label htmlFor={`${uid}-inicio`}>a partir de</label>
          <input id={`${uid}-inicio`} type="date" value={periodo?.start || hoje}
            onChange={e => { if (ehDataValida(e.target.value)) mudarPeriodo({ start: e.target.value }); }}
            className="px-2 py-1" style={{ ...campo, minWidth: 0 }} />
        </div>
      )}

      {proximas.length > 0 && (
        <p style={{ marginTop: 6, fontSize: 11, color: C.muted, lineHeight: 1.4 }}>
          Próximas: {proximas.map(d => dataCurta(d, hoje)).join(' · ')}
        </p>
      )}
    </div>
  );
}
