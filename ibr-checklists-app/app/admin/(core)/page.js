'use client';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { C } from '../../../lib/tokens';
import {
  useAdminData, Card, Kpi, SectionTitle, HealthDot, UpdatedAt, ErrorBox, Loading,
  Empty, ChartTip, Table, fmtDay, timeAgo, fmtDuration, EVENT_LABELS,
} from './ui';

// Visão Geral — o cockpit do lançamento. Poll de 30s.
export default function OverviewPage() {
  const { data, error, loading, updatedAt, refresh } = useAdminData('/api/admin/metrics/overview', 30000);

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox message={error} onRetry={refresh} />;
  const { northStar, kpis, companies, units, feed } = data;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: C.ink }}>Visão Geral</h1>
        <UpdatedAt updatedAt={updatedAt} onRefresh={refresh} loading={loading} />
      </div>

      {/* North star: checklists concluídos por dia */}
      <Card>
        <SectionTitle>Checklists concluídos</SectionTitle>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 40, fontWeight: 800, color: C.ink, lineHeight: 1 }}>{northStar.today}</span>
          <span style={{ fontSize: 13, color: C.muted }}>hoje · últimos 30 dias abaixo</span>
        </div>
        <div style={{ width: '100%', height: 160 }}>
          <ResponsiveContainer>
            <AreaChart data={northStar.series} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke={C.border} vertical={false} />
              <XAxis dataKey="day" tickFormatter={fmtDay} tick={{ fontSize: 11, fill: C.mutedLight }}
                     axisLine={{ stroke: C.border }} tickLine={false} minTickGap={28} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.mutedLight }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTip labelFormatter={fmtDay} />} />
              <Area type="monotone" dataKey="completions" name="concluídos" stroke={C.ink}
                    strokeWidth={2} fill={C.ink} fillOpacity={0.08} dot={false} activeDot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi label="Ativos hoje (DAU)" value={kpis.dauToday} />
        <Kpi label="Ativos 7d (WAU)" value={kpis.wau} />
        <Kpi label="Empresas ativas" value={`${kpis.activeCompanies}/${kpis.totalCompanies}`} sub="com checklist em 7d" />
        <Kpi label="Unidades ativas" value={`${kpis.activeUnits}/${kpis.totalUnits}`} sub="com checklist em 7d" />
        <Kpi label="Taxa de conclusão" value={kpis.completionRate7d != null ? `${kpis.completionRate7d}%` : '—'}
             sub={kpis.completionRateToday != null ? `hoje: ${kpis.completionRateToday}%` : 'itens feitos ÷ itens'} />
        <Kpi label="Tempo médio" value={fmtDuration(kpis.avgExecSeconds)} sub="início → conclusão (7d)" />
      </div>

      <div className="grid md:grid-cols-2 gap-4 items-start">
        {/* Saúde por empresa */}
        <Card>
          <SectionTitle>Saúde por empresa</SectionTitle>
          <Table
            head={['Empresa', 'Última atividade', '7d', '30d']}
            empty="Nenhuma empresa ainda."
            rows={companies.map(c => [
              <span key="n" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <HealthDot status={c.health} />{c.name || c.company_id}
                {!c.active && <span style={{ fontSize: 10, fontWeight: 800, color: C.critical }}>INATIVA</span>}
              </span>,
              timeAgo(c.last_activity),
              c.completions_7d, c.completions_30d,
            ])}
          />
        </Card>

        {/* Saúde por unidade */}
        <Card>
          <SectionTitle>Saúde por unidade</SectionTitle>
          <Table
            head={['Unidade', 'Último checklist', '7d', 'Operadores 7d']}
            empty="Nenhuma unidade ainda."
            rows={units.map(u => [
              <span key="n" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <HealthDot status={u.health} />{u.name || u.unit_id}
              </span>,
              timeAgo(u.last_completion),
              u.completions_7d, u.operators_7d,
            ])}
          />
        </Card>
      </div>

      {/* Feed em tempo quase-real */}
      <Card>
        <SectionTitle right={<span style={{ fontSize: 11, color: C.mutedLight }}>poll de 30s</span>}>
          Últimos eventos
        </SectionTitle>
        {feed.length === 0 ? <Empty>Nenhum evento registrado ainda.</Empty> : (
          <ul style={{ display: 'grid', gap: 0 }}>
            {feed.map(ev => (
              <li key={ev.id} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '7px 0', borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
                <span style={{ color: C.mutedLight, fontSize: 12, flexShrink: 0, width: 64 }}>{timeAgo(ev.occurred_at)}</span>
                <span style={{ color: C.ink, minWidth: 0 }}>
                  <strong>{ev.user_name || ev.user_id || 'visitante'}</strong>
                  {' '}{EVENT_LABELS[ev.event_type] || ev.event_type}
                  {ev.metadata?.template_name ? <span style={{ color: C.muted }}> · {ev.metadata.template_name}</span> : null}
                </span>
                <span style={{ marginLeft: 'auto', color: C.muted, fontSize: 12, flexShrink: 0 }}>
                  {[ev.company_name || ev.company_id, ev.unit_name || ev.unit_id].filter(Boolean).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
