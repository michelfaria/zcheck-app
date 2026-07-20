'use client';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { C } from '../../../../lib/tokens';
import {
  useAdminData, Card, SectionTitle, UpdatedAt, ErrorBox, Loading, Empty,
  ChartTip, Table, fmtDay, timeAgo, fmtDuration, SERIES, HealthDot,
} from '../ui';

const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// Uso Operacional: volume, conclusão × abandono, horários de pico, itens
// falhados e rankings.
export default function UsagePage() {
  const { data, error, loading, updatedAt, refresh } = useAdminData('/api/admin/metrics/usage', 60000);

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox message={error} onRetry={refresh} />;
  const { dailySeries, execFunnel, sectors, byType, heatmap, failedItems, unitRanking, userRanking } = data;

  const heatMax = Math.max(1, ...heatmap.flat());
  // Só as horas com algum uso (com 1h de folga de cada lado), para o heatmap
  // não virar uma faixa vazia de madrugada.
  let hMin = 24, hMax = -1;
  heatmap.forEach(row => row.forEach((v, h) => { if (v > 0) { hMin = Math.min(hMin, h); hMax = Math.max(hMax, h); } }));
  if (hMax === -1) { hMin = 6; hMax = 22; }
  hMin = Math.max(0, hMin - 1); hMax = Math.min(23, hMax + 1);
  const hours = Array.from({ length: hMax - hMin + 1 }, (_, i) => hMin + i);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: C.ink }}>Uso Operacional</h1>
        <UpdatedAt updatedAt={updatedAt} onRefresh={refresh} loading={loading} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        {/* Volume por dia */}
        <Card>
          <SectionTitle>Checklists por dia (30d)</SectionTitle>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer>
              <AreaChart data={dailySeries} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={C.border} vertical={false} />
                <XAxis dataKey="day" tickFormatter={fmtDay} tick={{ fontSize: 11, fill: C.mutedLight }}
                       axisLine={{ stroke: C.border }} tickLine={false} minTickGap={28} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.mutedLight }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip labelFormatter={fmtDay} />} />
                <Area type="monotone" dataKey="total" name="concluídos" stroke={C.ink}
                      strokeWidth={2} fill={C.ink} fillOpacity={0.08} dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Conclusão × abandono */}
        <Card>
          <SectionTitle right={<span style={{ fontSize: 11, color: C.mutedLight }}>tempo médio: {fmtDuration(execFunnel.avgSeconds)}</span>}>
            Iniciados × concluídos (30d)
          </SectionTitle>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer>
              <LineChart data={execFunnel.series} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={C.border} vertical={false} />
                <XAxis dataKey="day" tickFormatter={fmtDay} tick={{ fontSize: 11, fill: C.mutedLight }}
                       axisLine={{ stroke: C.border }} tickLine={false} minTickGap={28} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.mutedLight }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip labelFormatter={fmtDay} />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="started" name="iniciados" stroke={SERIES[0]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="completed" name="concluídos" stroke={SERIES[1]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p style={{ fontSize: 11, color: C.mutedLight, marginTop: 4 }}>
            Medido pelos eventos de início/conclusão — cobre a partir do lançamento desta versão.
          </p>
        </Card>
      </div>

      {/* Heatmap dia × hora */}
      <Card>
        <SectionTitle>Horários de pico (30d)</SectionTitle>
        {heatMax <= 1 && heatmap.flat().every(v => v === 0) ? <Empty /> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: 2, fontSize: 11 }}>
              <thead>
                <tr>
                  <th />
                  {hours.map(h => (
                    <th key={h} style={{ color: C.mutedLight, fontWeight: 600, padding: '0 2px', minWidth: 26 }}>{h}h</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DOW.map((d, dow) => (
                  <tr key={dow}>
                    <td style={{ color: C.muted, fontWeight: 700, paddingRight: 6, whiteSpace: 'nowrap' }}>{d}</td>
                    {hours.map(h => {
                      const v = heatmap[dow][h];
                      return (
                        <td key={h} title={`${d} ${h}h — ${v} checklist(s)`}
                            style={{ width: 26, height: 22, borderRadius: 4, textAlign: 'center',
                                     background: v ? `rgba(6,60,92,${0.08 + 0.72 * (v / heatMax)})` : C.bg,
                                     color: v / heatMax > 0.55 ? 'white' : C.muted }}>
                          {v || ''}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid md:grid-cols-2 gap-4 items-start">
        {/* Itens mais falhados */}
        <Card>
          <SectionTitle>Itens mais falhados (30d)</SectionTitle>
          <Table
            head={['Item', 'Checklist', 'Falhas']}
            empty="Nenhum item falhado no período."
            rows={failedItems.map(f => [
              <span key="t" style={{ whiteSpace: 'normal', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {f.critical && <span title="crítico" style={{ fontSize: 10, fontWeight: 800, color: 'white', background: C.critical, borderRadius: 4, padding: '1px 5px' }}>CRÍTICO</span>}
                {f.item_text}
              </span>,
              <span key="c" style={{ color: C.muted }}>{f.template_name}</span>,
              f.missed,
            ])}
          />
        </Card>

        {/* Uso por setor + tipo */}
        <div style={{ display: 'grid', gap: 16 }}>
          <Card>
            <SectionTitle>Por setor (30d)</SectionTitle>
            <Table
              head={['Setor', 'Checklists', 'Taxa média']}
              rows={sectors.slice(0, 10).map(s => [
                s.sector || '—', s.completions, s.avg_rate != null ? `${s.avg_rate}%` : '—',
              ])}
            />
          </Card>
          <Card>
            <SectionTitle>Por tipo de checklist (30d)</SectionTitle>
            <Table
              head={['Tipo', 'Checklists']}
              rows={byType.map(t => [t.name, t.completions])}
            />
          </Card>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4 items-start">
        <Card>
          <SectionTitle>Ranking de unidades (30d)</SectionTitle>
          <Table
            head={['#', 'Unidade', 'Checklists', 'Último']}
            rows={unitRanking.map((u, i) => [
              i + 1,
              <span key="n" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <HealthDot status={u.completions_7d > 0 ? 'green' : 'red'} />{u.name || u.unit_id}
              </span>,
              u.completions_30d,
              timeAgo(u.last_completion),
            ])}
          />
        </Card>
        <Card>
          <SectionTitle>Usuários mais ativos (30d)</SectionTitle>
          <Table
            head={['#', 'Usuário', 'Checklists 30d', '7d', 'Último']}
            rows={userRanking.map((u, i) => [
              i + 1, u.name || u.user_id, u.completions_30d, u.completions_7d, timeAgo(u.last_completion),
            ])}
          />
        </Card>
      </div>
    </div>
  );
}
