'use client';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LabelList } from 'recharts';
import { C } from '../../../../lib/tokens';
import {
  useAdminData, Card, Kpi, SectionTitle, UpdatedAt, ErrorBox, Loading, Empty,
  ChartTip, Table, fmtDay, timeAgo,
} from '../ui';

// Adoção — validação do MVP: funil de ativação, retenção por coorte,
// DAU/WAU/MAU + stickiness, PWA e comparativo por empresa/unidade.
export default function AdoptionPage() {
  const { data, error, loading, updatedAt, refresh } = useAdminData('/api/admin/metrics/adoption', 60000);

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox message={error} onRetry={refresh} />;
  const { funnel, cohorts, dauSeries, kpis, companies, units } = data;

  const cohortWeeks = Object.keys(cohorts).sort().slice(-8);
  const maxWeekN = Math.min(
    8,
    Math.max(0, ...cohortWeeks.map(w => Math.max(0, ...Object.keys(cohorts[w]).map(Number)))) + 1
  );

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: C.ink }}>Adoção</h1>
        <UpdatedAt updatedAt={updatedAt} onRefresh={refresh} loading={loading} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi label="DAU hoje" value={kpis.dauToday} />
        <Kpi label="WAU" value={kpis.wau} />
        <Kpi label="MAU" value={kpis.mau} />
        <Kpi label="Stickiness" value={kpis.stickiness != null ? `${kpis.stickiness}%` : '—'} sub="DAU ÷ WAU" />
        <Kpi label="Instalações PWA" value={kpis.pwaInstalls} />
        <Kpi label="Usuários via PWA" value={kpis.pwaUsers7d} sub="últimos 7 dias" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        {/* Funil de ativação */}
        <Card>
          <SectionTitle>Funil de ativação</SectionTitle>
          <div style={{ width: '100%', height: funnel.length * 44 + 20 }}>
            <ResponsiveContainer>
              <BarChart data={funnel} layout="vertical" margin={{ top: 0, right: 44, left: 10, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="stage" width={150}
                       tick={{ fontSize: 12, fill: C.ink }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} cursor={{ fill: C.bg }} />
                <Bar dataKey="value" name="total" fill={C.ink} radius={[0, 4, 4, 0]} barSize={18}>
                  <LabelList dataKey="value" position="right" style={{ fontSize: 12, fontWeight: 700, fill: C.ink }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p style={{ fontSize: 11, color: C.mutedLight, marginTop: 4 }}>
            Código: entradas no /entrar (30d) · demais etapas: usuários (todo o histórico).
          </p>
        </Card>

        {/* DAU 30d */}
        <Card>
          <SectionTitle>Usuários ativos por dia (30d)</SectionTitle>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer>
              <AreaChart data={dauSeries} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={C.border} vertical={false} />
                <XAxis dataKey="day" tickFormatter={fmtDay} tick={{ fontSize: 11, fill: C.mutedLight }}
                       axisLine={{ stroke: C.border }} tickLine={false} minTickGap={28} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.mutedLight }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip labelFormatter={fmtDay} />} />
                <Area type="monotone" dataKey="dau" name="usuários" stroke={C.ink}
                      strokeWidth={2} fill={C.ink} fillOpacity={0.08} dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Retenção por coorte semanal */}
      <Card>
        <SectionTitle>Retenção por coorte semanal</SectionTitle>
        {cohortWeeks.length === 0 ? <Empty>Sem coortes ainda — nasce com o primeiro login pós-launch.</Empty> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 480 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: C.muted, fontSize: 11, textTransform: 'uppercase' }}>Semana de entrada</th>
                  <th style={{ padding: '6px 8px', color: C.muted, fontSize: 11 }}>Usuários</th>
                  {Array.from({ length: maxWeekN }, (_, i) => (
                    <th key={i} style={{ padding: '6px 8px', color: C.muted, fontSize: 11 }}>S{i}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cohortWeeks.map(week => {
                  const size = cohorts[week][0] || 0;
                  return (
                    <tr key={week}>
                      <td style={{ padding: '6px 8px', color: C.ink, fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtDay(week)}</td>
                      <td style={{ padding: '6px 8px', color: C.ink, textAlign: 'center' }}>{size}</td>
                      {Array.from({ length: maxWeekN }, (_, i) => {
                        const users = cohorts[week][i] || 0;
                        const pct = size ? Math.round((users / size) * 100) : 0;
                        return (
                          <td key={i} title={`${users} usuários (${pct}%)`}
                              style={{ padding: '6px 8px', textAlign: 'center', minWidth: 44,
                                       background: users ? `rgba(6,60,92,${0.06 + 0.5 * (pct / 100)})` : 'transparent',
                                       color: pct > 55 ? 'white' : C.ink, borderRadius: 4 }}>
                            {users ? `${pct}%` : ''}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid md:grid-cols-2 gap-4 items-start">
        <Card>
          <SectionTitle>Por empresa (30d)</SectionTitle>
          <Table
            head={['Empresa', 'Usuários', 'Checklists 30d', 'Última atividade']}
            rows={companies.map(c => [c.name || c.company_id, c.users, c.completions_30d, timeAgo(c.last_activity)])}
          />
        </Card>
        <Card>
          <SectionTitle>Por unidade (30d) — comparativo entre lojas</SectionTitle>
          <Table
            head={['Unidade', 'Checklists 30d', '7d', 'Operadores 7d']}
            rows={units.map(u => [u.name || u.unit_id, u.completions_30d, u.completions_7d, u.operators_7d])}
          />
        </Card>
      </div>
    </div>
  );
}
