'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { C } from '../../../lib/tokens';

// Peças compartilhadas do ZCheck Core. Tudo consome os tokens de lib/tokens.js
// — o /admin não tem paleta própria.

// Paleta categórica dos gráficos multi-série (ordem FIXA, nunca ciclada).
// Validada contra o fundo C.bg em 19/07/2026 (lightness, chroma, CVD, contraste).
// Unidades usam a cor própria do banco quando existir; esta é o fallback.
export const SERIES = ['#2563EB', '#0D9488', '#B45309', '#7C3AED', '#DB2777'];

export const HEALTH = {
  green:  { color: C.success,  label: 'ativa' },
  yellow: { color: C.warning,  label: 'atenção' },
  red:    { color: C.critical, label: 'parada' },
  never:  { color: C.mutedLight, label: 'sem uso' },
};

// ── Polling com carimbo de atualização ───────────────────────────────────────
export function useAdminData(url, intervalMs = 45000) {
  const [state, setState] = useState({ data: null, error: null, loading: true, updatedAt: null });
  const timer = useRef(null);

  const load = useCallback(async () => {
    if (!url) return; // drill-down fechado: nada a buscar
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.status === 401) { window.location.href = '/admin/login'; return; }
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.message || body.reason || `HTTP ${res.status}`);
      setState({ data: body, error: null, loading: false, updatedAt: new Date() });
    } catch (e) {
      setState(s => ({ ...s, error: e.message || 'erro', loading: false }));
    }
  }, [url]);

  useEffect(() => {
    if (!url) { setState({ data: null, error: null, loading: false, updatedAt: null }); return; }
    setState(s => ({ ...s, loading: true }));
    load();
    timer.current = setInterval(load, intervalMs);
    return () => clearInterval(timer.current);
  }, [load, intervalMs, url]);

  return { ...state, refresh: load };
}

// ── Formatação ───────────────────────────────────────────────────────────────
export const fmtDay = d => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '');

export function timeAgo(ts) {
  if (!ts) return 'nunca';
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  return `há ${Math.floor(s / 86400)} d`;
}

export function fmtDuration(seconds) {
  if (seconds == null) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  return m < 60 ? `${m}min ${seconds % 60}s` : `${Math.floor(m / 60)}h ${m % 60}min`;
}

export const EVENT_LABELS = {
  app_opened: 'abriu o app', login: 'fez login', checklist_started: 'iniciou checklist',
  checklist_completed: 'concluiu checklist', checklist_abandoned: 'abandonou checklist',
  task_checked: 'marcou item', task_completed: 'concluiu item', task_reopened: 'reabriu item',
  photo_uploaded: 'enviou foto', pwa_installed: 'instalou o app (PWA)',
  company_code_entered: 'digitou código da empresa', onboarding_shown: 'viu o onboarding',
  onboarding_completed: 'concluiu o onboarding', onboarding_skipped: 'pulou o onboarding',
  template_adopted: 'adotou checklist pronto', briefing_opened: 'abriu o briefing',
  recognition_sent: 'enviou reconhecimento', login_success: 'fez login',
};

// ── Blocos visuais ───────────────────────────────────────────────────────────
export function Card({ children, style }) {
  return (
    <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, ...style }}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
      <h2 style={{ fontSize: 13, fontWeight: 800, color: C.ink, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {children}
      </h2>
      {right}
    </div>
  );
}

export function Kpi({ label, value, sub }) {
  return (
    <Card style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: C.ink, lineHeight: 1.1 }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 12, color: C.mutedLight, marginTop: 4 }}>{sub}</div>}
    </Card>
  );
}

export function HealthDot({ status, withLabel = false }) {
  const h = HEALTH[status] || HEALTH.never;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: h.color, flexShrink: 0 }} />
      {withLabel && <span style={{ fontSize: 12, color: C.muted }}>{h.label}</span>}
    </span>
  );
}

export function UpdatedAt({ updatedAt, onRefresh, loading }) {
  return (
    <span style={{ fontSize: 12, color: C.mutedLight, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {updatedAt ? `atualizado às ${updatedAt.toLocaleTimeString('pt-BR')}` : '…'}
      <button
        onClick={onRefresh} disabled={loading}
        style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700, color: C.muted, cursor: 'pointer' }}
      >
        atualizar
      </button>
    </span>
  );
}

export function ErrorBox({ message, onRetry }) {
  return (
    <Card style={{ borderColor: C.critical }}>
      <p style={{ fontSize: 14, color: C.critical, fontWeight: 700, marginBottom: 6 }}>Não foi possível carregar os dados.</p>
      <p style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>{message}</p>
      <button
        onClick={onRetry}
        style={{ background: C.ink, color: 'white', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
      >
        Tentar de novo
      </button>
    </Card>
  );
}

export function Loading() {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 12, height: 96, opacity: 0.6 }} />
      ))}
      <p style={{ fontSize: 13, color: C.mutedLight }}>Carregando dados…</p>
    </div>
  );
}

export function Empty({ children }) {
  return (
    <p style={{ fontSize: 13, color: C.mutedLight, padding: '18px 0', textAlign: 'center' }}>
      {children || 'Sem dados no período ainda.'}
    </p>
  );
}

// Tooltip padrão dos gráficos Recharts — texto em tokens, nunca na cor da série.
export function ChartTip({ active, payload, label, labelFormatter, valueFormatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', boxShadow: '0 4px 12px rgba(6,60,92,0.10)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 4 }}>
        {labelFormatter ? labelFormatter(label) : label}
      </div>
      {payload.map((p, i) => (
        <div key={i} style={{ fontSize: 13, color: C.ink, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: p.color || C.ink }} />
          <span style={{ color: C.muted }}>{p.name}:</span>
          <strong>{valueFormatter ? valueFormatter(p.value) : p.value}</strong>
        </div>
      ))}
    </div>
  );
}

// Tabela enxuta e densa, com scroll horizontal próprio no mobile.
export function Table({ head, rows, empty }) {
  if (!rows?.length) return <Empty>{empty}</Empty>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '6px 8px', fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j} style={{ textAlign: j === 0 ? 'left' : 'right', padding: '8px', color: C.ink, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
