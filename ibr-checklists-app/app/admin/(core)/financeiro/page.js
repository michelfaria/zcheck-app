'use client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import { C } from '../../../../lib/tokens';
import {
  useAdminData, Card, Kpi, SectionTitle, UpdatedAt, ErrorBox, Loading, Empty,
  ChartTip, Table, timeAgo, HealthDot,
} from '../ui';

const money = v => (v == null ? '—' : `R$ ${Number(v).toLocaleString('pt-BR')}`);

const STATE = {
  active:   { label: 'ASSINANTE', color: C.success },
  trialing: { label: 'TRIAL',     color: C.warning },
  expired:  { label: 'VENCIDO',   color: C.critical },
};

// Financeiro — funil de vendas, assinaturas, MRR e projeção por adoção.
export default function FinancePage() {
  const { data, error, loading, updatedAt, refresh } = useAdminData('/api/admin/metrics/finance', 60000);

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox message={error} onRetry={refresh} />;
  const { kpis, funnel, companies } = data;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: C.ink }}>Financeiro</h1>
        <UpdatedAt updatedAt={updatedAt} onRefresh={refresh} loading={loading} />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi label="MRR" value={money(kpis.mrr)} sub={`ARR ${money(kpis.arr)}`} />
        <Kpi label="Assinantes" value={kpis.payingCount}
             sub={kpis.courtesyCount ? `+ ${kpis.courtesyCount} cortesia` : 'pagantes'} />
        <Kpi label="Em trial" value={kpis.trialingCount} />
        <Kpi label="Trial vencido" value={kpis.expiredCount} sub="não converteram (ainda)" />
        <Kpi label="Conversão" value={kpis.conversionRate != null ? `${kpis.conversionRate}%` : '—'}
             sub="pagantes ÷ decididos" />
        <Kpi label="MRR projetado 30d" value={money(kpis.projectedMrr30d)}
             sub={`+${money(kpis.projectedAdd)} dos trials`} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        {/* Funil de vendas */}
        <Card>
          <SectionTitle>Funil de vendas</SectionTitle>
          <div style={{ width: '100%', height: funnel.length * 44 + 20 }}>
            <ResponsiveContainer>
              <BarChart data={funnel} layout="vertical" margin={{ top: 0, right: 44, left: 10, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="stage" width={170}
                       tick={{ fontSize: 12, fill: C.ink }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} cursor={{ fill: C.bg }} />
                <Bar dataKey="value" name="total" fill={C.ink} radius={[0, 4, 4, 0]} barSize={18}>
                  <LabelList dataKey="value" position="right" style={{ fontSize: 12, fontWeight: 700, fill: C.ink }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p style={{ fontSize: 11, color: C.mutedLight, marginTop: 4 }}>
            Waitlist/cadastros: acumulado · demais etapas: estado atual das empresas.
          </p>
        </Card>

        {/* Projeção */}
        <Card>
          <SectionTitle>Projeção de conversão dos trials</SectionTitle>
          {companies.filter(c => c.projection).length === 0
            ? <Empty>Nenhuma empresa em trial no momento.</Empty>
            : (
              <>
                <Table
                  head={['Empresa', 'Uso 7d', 'Prob.', 'Tier provável', 'Valor esperado']}
                  rows={companies.filter(c => c.projection).map(c => [
                    c.name,
                    c.completions_7d,
                    `${Math.round(c.projection.probability * 100)}%`,
                    c.projection.tier,
                    money(Math.round(c.projection.probability * c.projection.value)),
                  ])}
                />
                <p style={{ fontSize: 11, color: C.mutedLight, marginTop: 8 }}>
                  Regra declarada: ≥10 checklists/7d → 60% · 1–9 → 30% · sem uso → 5%,
                  sobre o preço do tier que comporta as unidades. Estimativa simples — não é promessa.
                </p>
              </>
            )}
        </Card>
      </div>

      {/* Por empresa */}
      <Card>
        <SectionTitle>Valores por empresa</SectionTitle>
        <Table
          head={['Empresa', 'Status', 'Plano', 'Mensalidade', 'Trial até', 'Pago até', 'Uso 30d', 'Última atividade']}
          empty="Nenhuma empresa."
          rows={companies.map(c => {
            const s = STATE[c.state] || STATE.expired;
            return [
              <span key="n" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <HealthDot status={c.completions_7d > 0 ? 'green' : c.completions_30d > 0 ? 'yellow' : 'never'} />
                <strong>{c.name}</strong>
                {!c.active && <span style={{ fontSize: 10, fontWeight: 800, color: C.critical }}>INATIVA</span>}
              </span>,
              <span key="s" style={{ fontSize: 10, fontWeight: 800, color: 'white', background: s.color, borderRadius: 4, padding: '2px 6px' }}>
                {s.label}{c.state === 'trialing' && c.trial_days_left != null ? ` ${c.trial_days_left}d` : ''}
              </span>,
              c.plan_tier || (c.state === 'trialing' ? 'trial' : '—'),
              c.monthly > 0 ? money(c.monthly) : '—',
              c.trial_ends_at ? new Date(c.trial_ends_at).toLocaleDateString('pt-BR') : '—',
              c.current_period_end ? new Date(c.current_period_end).toLocaleDateString('pt-BR') : '—',
              c.completions_30d,
              timeAgo(c.last_activity),
            ];
          })}
        />
      </Card>
    </div>
  );
}
