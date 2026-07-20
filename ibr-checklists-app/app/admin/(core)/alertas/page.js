'use client';
import { useState } from 'react';
import { C } from '../../../../lib/tokens';
import {
  useAdminData, Card, SectionTitle, UpdatedAt, ErrorBox, Loading, Empty, timeAgo,
} from '../ui';

const SEVERITY = {
  critical: { label: 'CRÍTICO', color: C.critical, bg: 'rgba(185,28,28,0.08)' },
  warning:  { label: 'ATENÇÃO', color: C.warning,  bg: 'rgba(180,83,9,0.08)' },
  info:     { label: 'INFO',    color: C.muted,    bg: 'rgba(91,107,120,0.08)' },
};

const RULE_LABELS = {
  unit_inactive: 'Unidade parada',
  volume_drop: 'Queda de volume',
  low_completion_rate: 'Taxa de conclusão baixa',
  activated_user_gone: 'Usuário ativado sumiu',
  abandon_streak: 'Abandonos em sequência',
};

// Painel de alertas — regras avaliadas de hora em hora (ou sob demanda).
export default function AlertsPage() {
  const { data, error, loading, updatedAt, refresh } = useAdminData('/api/admin/alerts', 60000);
  const [busy, setBusy] = useState(null); // id sendo resolvido | 'run'

  const notifyBadge = () => window.dispatchEvent(new Event('zcheck:alerts-changed'));

  async function resolve(id, resolved) {
    setBusy(id);
    try {
      await fetch('/api/admin/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, resolved }),
      });
      await refresh();
      notifyBadge();
    } finally { setBusy(null); }
  }

  async function runNow() {
    setBusy('run');
    try {
      await fetch('/api/admin/alerts', { method: 'POST' });
      await refresh();
      notifyBadge();
    } finally { setBusy(null); }
  }

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox message={error} onRetry={refresh} />;
  const { open, resolved, run } = data;

  const AlertRow = (a, isOpen) => {
    const sev = SEVERITY[a.severity] || SEVERITY.info;
    return (
      <li key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 8, background: isOpen ? sev.bg : 'transparent', border: `1px solid ${isOpen ? sev.color : C.border}`, opacity: isOpen ? 1 : 0.75 }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: 'white', background: sev.color, borderRadius: 4, padding: '2px 6px', flexShrink: 0, marginTop: 2 }}>
          {sev.label}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: 14, color: C.ink, fontWeight: 600 }}>{a.message}</p>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
            {RULE_LABELS[a.rule] || a.rule}
            {a.company_id ? ` · ${a.company_id}` : ''}
            {' · '}{timeAgo(a.created_at)}
            {!isOpen && a.resolved_at ? ` · resolvido ${timeAgo(a.resolved_at)}` : ''}
          </p>
        </div>
        <button
          onClick={() => resolve(a.id, isOpen)}
          disabled={busy === a.id}
          style={{ flexShrink: 0, background: isOpen ? 'white' : 'none', border: `1px solid ${C.borderStrong}`, borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 700, color: C.ink, cursor: 'pointer' }}
        >
          {busy === a.id ? '…' : isOpen ? 'Resolver' : 'Reabrir'}
        </button>
      </li>
    );
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: C.ink }}>Alertas</h1>
        <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={runNow} disabled={busy === 'run'}
            style={{ background: C.ink, color: 'white', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            {busy === 'run' ? 'Verificando…' : 'Verificar agora'}
          </button>
          <UpdatedAt updatedAt={updatedAt} onRefresh={refresh} loading={loading} />
        </span>
      </div>

      {run?.error && (
        <Card style={{ borderColor: C.warning }}>
          <p style={{ fontSize: 13, color: C.warning, fontWeight: 700 }}>
            A avaliação automática falhou: {run.error}
          </p>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
            Se a migration 20260719_admin_alerts.sql ainda não rodou no Supabase, esta é a causa.
          </p>
        </Card>
      )}

      <Card>
        <SectionTitle right={<span style={{ fontSize: 11, color: C.mutedLight }}>
          {run?.lastRun ? `última verificação ${timeAgo(run.lastRun)}` : ''}
        </span>}>
          Abertos ({open.length})
        </SectionTitle>
        {open.length === 0
          ? <Empty>Nenhum alerta aberto. Tudo operando dentro das regras. ✔</Empty>
          : <ul style={{ display: 'grid', gap: 8 }}>{open.map(a => AlertRow(a, true))}</ul>}
      </Card>

      <Card>
        <SectionTitle>Resolvidos recentemente</SectionTitle>
        {resolved.length === 0
          ? <Empty>Nada resolvido ainda.</Empty>
          : <ul style={{ display: 'grid', gap: 8 }}>{resolved.map(a => AlertRow(a, false))}</ul>}
      </Card>

      <p style={{ fontSize: 12, color: C.mutedLight }}>
        Regras: unidade sem checklists há 24h (crítico a 72h) · queda &gt;30% vs média de 7 dias ·
        taxa de conclusão &lt;70% no dia · usuário ativado sem atividade há 7 dias · 3+ abandonos em 24h.
        A avaliação roda sozinha quando o painel está aberto e via cron diário como backstop.
      </p>
    </div>
  );
}
