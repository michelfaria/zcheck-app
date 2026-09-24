'use client';
import { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';
import { C } from '../../../../lib/tokens';
import {
  useAdminData, Card, SectionTitle, UpdatedAt, ErrorBox, Loading, Empty,
  ChartTip, Table, fmtDay, timeAgo,
} from '../ui';

// Monitoramento do Zeca — o assistente de IA que responde na Central de Ajuda.
// Duas perguntas, nesta ordem: ele está de pé? e o que estão perguntando?

const STATUS = {
  ativo:     { color: C.success,  label: 'Ativo',     icon: CheckCircle2, hint: 'respondendo normalmente' },
  degradado: { color: C.warning,  label: 'Degradado', icon: AlertTriangle, hint: 'responde, mas com limitação' },
  inativo:   { color: C.critical, label: 'Inativo',   icon: XCircle, hint: 'não responde aos usuários' },
};

const SEVERITY_ICON = { inativo: XCircle, degradado: AlertTriangle, info: Info };
const SEVERITY_COLOR = { inativo: C.critical, degradado: C.warning, info: C.mutedLight };

// Renderizador mínimo de markdown (mesmo espírito do /admin/agentes).
function Md({ text }) {
  const out = [];
  String(text || '').split('\n').forEach((raw, i) => {
    const line = raw.trimEnd();
    if (!line.trim()) return;
    const bold = s => s.split('**').map((part, j) => (j % 2 === 1 ? <strong key={j}>{part}</strong> : part));
    if (/^#{1,4}\s/.test(line)) {
      out.push(
        <h3 key={i} style={{ fontSize: 12, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '14px 0 6px' }}>
          {line.replace(/^#{1,4}\s/, '')}
        </h3>
      );
    } else {
      out.push(<p key={i} style={{ margin: '4px 0', lineHeight: 1.55, fontSize: 14, color: C.ink }}>{bold(line)}</p>);
    }
  });
  return <div>{out}</div>;
}

function Reason({ reason }) {
  const Icon = SEVERITY_ICON[reason.severity] || Info;
  const color = SEVERITY_COLOR[reason.severity] || C.mutedLight;
  return (
    <div style={{ display: 'flex', gap: 10, padding: '10px 0', borderTop: `1px solid ${C.border}` }}>
      <Icon size={16} color={color} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{reason.label}</div>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 2, lineHeight: 1.5 }}>{reason.detail}</div>
        {reason.fix && (
          <div style={{ fontSize: 13, color: C.ink, marginTop: 4 }}>
            <strong style={{ fontWeight: 600 }}>O que fazer:</strong> {reason.fix}
          </div>
        )}
      </div>
    </div>
  );
}

function Pill({ children, tone = 'muted' }) {
  const bg = { muted: C.bg, ok: '#ECFDF5', bad: '#FEF2F2' }[tone] || C.bg;
  const fg = { muted: C.muted, ok: C.success, bad: C.critical }[tone] || C.muted;
  return (
    <span style={{ background: bg, color: fg, borderRadius: 999, fontSize: 11, fontWeight: 600, padding: '2px 8px', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

export default function SupportAgentPage() {
  const { data, error, loading, updatedAt, refresh } = useAdminData('/api/admin/support-agent', 60000);
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);
  const [themes, setThemes] = useState(null);

  async function post(action) {
    setBusy(action); setNotice(null);
    try {
      const res = await fetch('/api/admin/support-agent', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const body = await res.json();
      if (!body.ok) throw new Error(body.message || body.reason || `HTTP ${res.status}`);
      if (action === 'probe') {
        setNotice(body.probe.ok
          ? `Verificação OK — o Zeca respondeu em ${body.probe.ms}ms.`
          : `Verificação falhou: ${body.probe.error}`);
        refresh();
      }
      if (action === 'analyze') { setThemes(body.themes); setNotice('Análise gerada.'); }
    } catch (e) {
      setNotice(`Falhou: ${e.message}`);
    } finally {
      setBusy(null);
    }
  }

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox message={error} onRetry={refresh} />;

  const { health, config, probe, insights, lastRetro, lastThemes } = data;
  const s = STATUS[health.status] || STATUS.degradado;
  const StatusIcon = s.icon;
  const v = insights.volume;
  const shownThemes = themes || lastThemes;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: C.ink }}>Assistente (Zeca)</h1>
        <UpdatedAt updatedAt={updatedAt} onRefresh={refresh} loading={loading} />
      </div>

      {/* ── Status ───────────────────────────────────────────────────────── */}
      <Card style={{ borderColor: s.color, borderWidth: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <StatusIcon size={28} color={s.color} aria-hidden />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color, lineHeight: 1.1 }}>{s.label}</div>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>
              {s.hint} · assistente de IA da Central de Ajuda (/ajuda/assistente)
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => post('probe')} disabled={busy === 'probe'}
              style={{ background: C.ink, color: 'white', border: 'none', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: busy === 'probe' ? 0.6 : 1 }}
            >
              {busy === 'probe' ? 'Testando…' : 'Testar agora'}
            </button>
            <a
              href="/ajuda/assistente" target="_blank" rel="noreferrer"
              style={{ border: `1px solid ${C.borderStrong}`, borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 700, color: C.ink, textDecoration: 'none' }}
            >
              Abrir o Zeca
            </a>
          </div>
        </div>

        {notice && (
          <p style={{ fontSize: 13, color: C.ink, background: C.bg, borderRadius: 8, padding: '8px 10px', marginTop: 12 }}>{notice}</p>
        )}

        <div style={{ marginTop: 12 }}>
          {health.reasons.length === 0
            ? <p style={{ fontSize: 13, color: C.muted, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                Nenhum problema detectado: chave da API presente, base de conhecimento carregada e verificação ao vivo bem-sucedida.
              </p>
            : health.reasons.map((r, i) => <Reason key={i} reason={r} />)}
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: C.mutedLight, borderTop: `1px solid ${C.border}`, marginTop: 10, paddingTop: 10 }}>
          <span>modelo: {config.model}</span>
          <span>base: {config.articleCount} artigos</span>
          <span>chave da API: {config.hasApiKey ? 'presente' : 'ausente'}</span>
          <span>
            última verificação: {probe ? `${probe.ok ? 'OK' : 'falhou'} ${timeAgo(probe.at)}` : 'nunca'}
          </span>
          <span>última conversa: {insights.lastChatAt ? timeAgo(insights.lastChatAt) : 'nunca'}</span>
        </div>
      </Card>

      {/* ── Volume e satisfação ──────────────────────────────────────────── */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Conversas (7d)</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: C.ink, lineHeight: 1.1 }}>{v.total7}</div>
          <div style={{ fontSize: 12, color: C.mutedLight, marginTop: 4 }}>{v.sessions7} sessões</div></Card>
        <Card><div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Conversas (30d)</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: C.ink, lineHeight: 1.1 }}>{v.total30}</div>
          <div style={{ fontSize: 12, color: C.mutedLight, marginTop: 4 }}>{v.sessions30} sessões</div></Card>
        <Card><div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Aprovação (30d)</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: C.ink, lineHeight: 1.1 }}>
            {v.approval30 == null ? '—' : `${v.approval30}%`}
          </div>
          <div style={{ fontSize: 12, color: C.mutedLight, marginTop: 4 }}>
            {v.up30 + v.down30 === 0 ? 'ninguém avaliou ainda' : `${v.up30} 👍 · ${v.down30} 👎`}
          </div></Card>
        <Card><div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Reprovadas (7d)</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: v.down7 > 0 ? C.critical : C.ink, lineHeight: 1.1 }}>{v.down7}</div>
          <div style={{ fontSize: 12, color: C.mutedLight, marginTop: 4 }}>respostas com 👎</div></Card>
      </div>

      <Card>
        <SectionTitle>Conversas por dia (30d)</SectionTitle>
        {insights.daily.length === 0 ? <Empty>Nenhuma conversa nos últimos 30 dias.</Empty> : (
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer>
              <AreaChart data={insights.daily} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={C.border} vertical={false} />
                <XAxis dataKey="day" tickFormatter={fmtDay} tick={{ fontSize: 11, fill: C.mutedLight }}
                       axisLine={{ stroke: C.border }} tickLine={false} minTickGap={28} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.mutedLight }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip labelFormatter={fmtDay} />} />
                <Area type="monotone" dataKey="conversas" name="conversas" stroke={C.ink} strokeWidth={2}
                      fill={C.ink} fillOpacity={0.08} dot={false} activeDot={{ r: 4 }} />
                <Area type="monotone" dataKey="negativas" name="com 👎" stroke={C.critical} strokeWidth={2}
                      fill={C.critical} fillOpacity={0.06} dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* ── Temas ────────────────────────────────────────────────────────── */}
      <Card>
        <SectionTitle right={<span style={{ fontSize: 11, color: C.mutedLight }}>classificação por regra, sem IA</span>}>
          Assuntos mais perguntados (30d)
        </SectionTitle>
        <Table
          head={['Tema', 'Perguntas', '% do total', '👎', 'Artigo que cobre']}
          empty="Nenhuma pergunta classificada ainda."
          rows={insights.topics.map(t => [
            <span key="l" title={t.examples.join(' · ')}>{t.label}</span>,
            t.count,
            `${t.share}%`,
            t.down > 0 ? <Pill key="d" tone="bad">{t.down}</Pill> : '—',
            t.article
              ? <a key="a" href={t.article} target="_blank" rel="noreferrer" style={{ color: C.ink, fontSize: 12 }}>abrir artigo</a>
              : <Pill key="a" tone="bad">sem artigo</Pill>,
          ])}
        />
        {insights.untagged.count > 0 && (
          <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
            <p style={{ fontSize: 13, color: C.ink, fontWeight: 600 }}>
              {insights.untagged.count} pergunta(s) fora dos temas conhecidos
            </p>
            <p style={{ fontSize: 12, color: C.mutedLight, margin: '2px 0 6px' }}>
              Assunto novo ou pergunta mal formulada — é aqui que aparece o que ainda não tem artigo.
            </p>
            <ul style={{ paddingLeft: 18, fontSize: 13, color: C.muted }}>
              {insights.untagged.examples.map((q, i) => <li key={i} style={{ marginBottom: 3 }}>{q}</li>)}
            </ul>
          </div>
        )}
      </Card>

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <Card>
          <SectionTitle>Termos mais repetidos (30d)</SectionTitle>
          <Table
            head={['Termo', 'Perguntas']}
            empty="Nenhum termo se repetiu ainda."
            rows={insights.terms.map(t => [t.term, t.count])}
          />
        </Card>

        <Card>
          <SectionTitle>Buscas sem resultado na Central (30d)</SectionTitle>
          <Table
            head={['Busca', 'Vezes']}
            empty="Toda busca encontrou algo."
            rows={insights.central.zeroResults.map(r => [r.key, r.count])}
          />
          <p style={{ fontSize: 12, color: C.mutedLight, marginTop: 8 }}>
            {insights.central.searches30} buscas no período. Busca sem resultado é lacuna de conteúdo direta.
          </p>
        </Card>
      </div>

      {/* ── Onde o Zeca errou ────────────────────────────────────────────── */}
      <Card>
        <SectionTitle>Respostas reprovadas pelos usuários (30d)</SectionTitle>
        {insights.negatives.length === 0 ? <Empty>Nenhuma resposta levou 👎 no período.</Empty> : (
          <div style={{ display: 'grid', gap: 10 }}>
            {insights.negatives.map((n, i) => (
              <div key={i} style={{ borderTop: i ? `1px solid ${C.border}` : 'none', paddingTop: i ? 10 : 0 }}>
                <div style={{ fontSize: 11, color: C.mutedLight, marginBottom: 2 }}>{timeAgo(n.at)}</div>
                <div style={{ fontSize: 14, color: C.ink, fontWeight: 600 }}>{n.question}</div>
                <div style={{ fontSize: 13, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>{n.reply}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Análise com IA ───────────────────────────────────────────────── */}
      <Card>
        <SectionTitle
          right={
            <button
              onClick={() => post('analyze')} disabled={busy === 'analyze' || v.total30 === 0}
              style={{ background: 'none', border: `1px solid ${C.borderStrong}`, borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, color: C.ink, cursor: v.total30 === 0 ? 'not-allowed' : 'pointer', opacity: busy === 'analyze' || v.total30 === 0 ? 0.6 : 1 }}
            >
              {busy === 'analyze' ? 'Analisando…' : 'Analisar com IA'}
            </button>
          }
        >
          Leitura das perguntas
        </SectionTitle>
        {shownThemes
          ? (<>
              <p style={{ fontSize: 11, color: C.mutedLight, marginBottom: 8 }}>gerada {timeAgo(shownThemes.created_at)}</p>
              <Md text={shownThemes.report_md} />
            </>)
          : <Empty>Ainda sem leitura. O botão agrupa as perguntas por intenção e aponta as lacunas de conteúdo.</Empty>}
      </Card>

      {/* ── Aprendizado do agente ────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <Card>
          <SectionTitle>Diretrizes e memória em uso</SectionTitle>
          {config.guidelines.length === 0 && config.memories.length === 0
            ? <Empty>O Zeca roda só com o prompt-base. As diretrizes nascem na retrospectiva semanal e são aprovadas em Time de Gestão.</Empty>
            : (
              <div style={{ display: 'grid', gap: 8 }}>
                {config.guidelines.map((g, i) => (
                  <div key={`g${i}`} style={{ fontSize: 13, color: C.ink }}>
                    <Pill>diretriz</Pill> {g.system_md}
                  </div>
                ))}
                {config.memories.map((m, i) => (
                  <div key={`m${i}`} style={{ fontSize: 13, color: C.ink }}>
                    <Pill>lição</Pill> {m.content}
                  </div>
                ))}
              </div>
            )}
        </Card>

        <Card>
          <SectionTitle>Última retrospectiva semanal</SectionTitle>
          {lastRetro
            ? (<>
                <p style={{ fontSize: 11, color: C.mutedLight, marginBottom: 8 }}>
                  {timeAgo(lastRetro.created_at)} · {lastRetro.data_snapshot?.total ?? '—'} conversas analisadas
                </p>
                <Md text={lastRetro.report_md} />
              </>)
            : <Empty>Nenhuma retrospectiva ainda — ela roda toda segunda às 9h UTC.</Empty>}
        </Card>
      </div>
    </div>
  );
}
