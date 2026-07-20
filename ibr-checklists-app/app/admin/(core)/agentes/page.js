'use client';
import { useState } from 'react';
import { C } from '../../../../lib/tokens';
import {
  useAdminData, Card, SectionTitle, UpdatedAt, ErrorBox, Loading, Empty, timeAgo,
} from '../ui';

const ACTION_LABELS = {
  save_memory: 'Salvar lição na memória',
  draft_message: 'Rascunho de follow-up',
  send_followup: 'Enviar follow-up por E-MAIL',
  extend_trial: '+7 dias de trial',
  deactivate_company: 'Desativar empresa',
  activate_company: 'Reativar empresa',
  resolve_alert: 'Resolver alerta',
  update_prompt: 'Melhorar prompt de agente',
  set_goal: 'Definir meta do time',
};

// Link 1-clique: abre o WhatsApp do contato com o texto pronto.
function waLink(whatsapp, message) {
  if (!whatsapp || !message) return null;
  return `https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`;
}

// 👍/👎 do fundador — vira sinal de calibragem na retrospectiva semanal.
function Rating({ reportId, current, onRate }) {
  const btn = (val, icon) => (
    <button
      onClick={() => onRate(reportId, current === val ? null : val)}
      title={val === 1 ? 'útil' : 'não foi útil'}
      style={{ background: current === val ? C.ink : 'none', color: current === val ? 'white' : C.muted,
               border: `1px solid ${current === val ? C.ink : C.border}`, borderRadius: 6,
               padding: '2px 8px', fontSize: 13, cursor: 'pointer' }}>
      {icon}
    </button>
  );
  return <span style={{ display: 'inline-flex', gap: 4 }}>{btn(1, '👍')}{btn(-1, '👎')}</span>;
}

// Renderizador mínimo de markdown (títulos, negrito, listas) — sem HTML bruto.
function Md({ text }) {
  const lines = String(text || '').split('\n');
  const out = [];
  let list = [];
  const bold = (s, key) => s.split('**').map((part, i) =>
    i % 2 === 1 ? <strong key={`${key}-${i}`}>{part}</strong> : part);
  const flush = () => {
    if (list.length) {
      out.push(<ul key={`ul-${out.length}`} style={{ paddingLeft: 18, margin: '4px 0' }}>
        {list.map((li, i) => <li key={i} style={{ marginBottom: 3 }}>{bold(li, `li-${i}`)}</li>)}
      </ul>);
      list = [];
    }
  };
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (/^#{1,4}\s/.test(line)) {
      flush();
      out.push(<h3 key={i} style={{ fontSize: 13, fontWeight: 800, color: C.ink, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '14px 0 6px' }}>
        {line.replace(/^#{1,4}\s/, '')}
      </h3>);
    } else if (/^[-*]\s/.test(line.trim())) {
      list.push(line.trim().replace(/^[-*]\s/, ''));
    } else if (line.trim() === '') {
      flush();
    } else {
      flush();
      out.push(<p key={i} style={{ margin: '4px 0', lineHeight: 1.55 }}>{bold(line, `p-${i}`)}</p>);
    }
  });
  flush();
  return <div style={{ fontSize: 14, color: C.ink }}>{out}</div>;
}

// Time de gestão de IA — briefing, fila de aprovação, chat e memória.
export default function AgentsPage() {
  const { data, error, loading, updatedAt, refresh } = useAdminData('/api/admin/agents', 60000);
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);
  const [question, setQuestion] = useState('');
  const [chat, setChat] = useState(null); // { agentName, answer }

  async function runCycle() {
    setBusy('cycle'); setNotice(null);
    try {
      const res = await fetch('/api/admin/agents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run_cycle' }),
      });
      const d = await res.json().catch(() => ({}));
      setNotice(d.ok
        ? { ok: true, message: `Ciclo concluído: ${d.directors} diretores, ${d.proposed} ação(ões) propostas, ${d.autoExecuted} auto-executadas.` }
        : { ok: false, message: d.message || d.reason || 'falhou' });
      await refresh();
    } finally { setBusy(null); }
  }

  async function decide(id, decision) {
    setBusy(id); setNotice(null);
    try {
      const res = await fetch('/api/admin/agents/actions', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, decision }),
      });
      const d = await res.json().catch(() => ({}));
      if (!d.ok) setNotice({ ok: false, message: d.message || 'falhou' });
      await refresh();
    } finally { setBusy(null); }
  }

  async function sendQuestion(e) {
    e.preventDefault();
    if (!question.trim()) return;
    setBusy('ask'); setChat(null); setNotice(null);
    try {
      const res = await fetch('/api/admin/agents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ask', question }),
      });
      const d = await res.json().catch(() => ({}));
      if (d.ok) { setChat(d); setQuestion(''); await refresh(); }
      else setNotice({ ok: false, message: d.message || d.reason || 'falhou' });
    } finally { setBusy(null); }
  }

  async function addGoal(e) {
    e.preventDefault();
    const form = e.target;
    const goal = {
      label: form.label.value, target: form.target.value,
      metric: form.metric.value, unit: form.unit.value || null, deadline: form.deadline.value || null,
    };
    if (!goal.label || !goal.target) return;
    setBusy('goal');
    try {
      await fetch('/api/admin/agents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_goal', goal }),
      });
      form.reset();
      await refresh();
    } finally { setBusy(null); }
  }

  async function archiveGoal(id) {
    setBusy(id);
    try {
      await fetch('/api/admin/agents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'archive_goal', id }),
      });
      await refresh();
    } finally { setBusy(null); }
  }

  async function rate(reportId, rating) {
    await fetch('/api/admin/agents', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report_id: reportId, rating }),
    }).catch(() => {});
    await refresh();
  }

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox message={error} onRetry={refresh} />;
  const { briefing, retro, refinements = [], pendingActions, recentActions, usage, memories, reports, agents, hasApiKey, goals = [], contacts = {} } = data;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: C.ink }}>Time de Gestão</h1>
        <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: C.muted, fontWeight: 700 }}>
            chamadas 24h: {usage.calls}/{usage.limit}
          </span>
          <button onClick={runCycle} disabled={busy === 'cycle' || !hasApiKey}
            style={{ background: hasApiKey ? C.ink : C.mutedLight, color: 'white', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            {busy === 'cycle' ? 'Rodando ciclo…' : 'Rodar ciclo agora'}
          </button>
          <UpdatedAt updatedAt={updatedAt} onRefresh={refresh} loading={loading} />
        </span>
      </div>

      {!hasApiKey && (
        <Card style={{ borderColor: C.warning }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: C.warning }}>
            ANTHROPIC_API_KEY não configurada na Vercel — o time está montado, mas mudo.
          </p>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
            Rode: <code>npx vercel env add ANTHROPIC_API_KEY production</code> e redeploy.
          </p>
        </Card>
      )}

      {notice && (
        <Card style={{ borderColor: notice.ok ? C.success : C.critical, padding: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: notice.ok ? C.success : C.critical }}>{notice.message}</p>
        </Card>
      )}

      {/* Fila de aprovação — a governança em ação */}
      <Card style={pendingActions.length ? { borderColor: C.warning } : undefined}>
        <SectionTitle>Aguardando sua aprovação ({pendingActions.length})</SectionTitle>
        {pendingActions.length === 0 ? <Empty>Nada pendente — o time está operando dentro das políticas.</Empty> : (
          <ul style={{ display: 'grid', gap: 8 }}>
            {pendingActions.map(a => (
              <li key={a.id} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: 'white', background: C.ink, borderRadius: 4, padding: '2px 6px' }}>
                    {agents[a.agent] || a.agent}
                  </span>
                  <strong style={{ fontSize: 13, color: C.ink }}>{ACTION_LABELS[a.action_type] || a.action_type}</strong>
                  {a.payload?.company_id && <span style={{ fontSize: 12, color: C.muted }}>→ {a.payload.company_id}</span>}
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: C.mutedLight }}>{timeAgo(a.created_at)}</span>
                </div>
                <p style={{ fontSize: 13, color: C.muted, margin: '6px 0' }}>{a.reason}</p>
                {a.payload?.message && (
                  <p style={{ fontSize: 13, color: C.ink, background: C.bg, borderRadius: 6, padding: '8px 10px', margin: '6px 0' }}>
                    “{a.payload.message}”
                  </p>
                )}
                {a.action_type === 'send_followup' && a.payload?.company_id && (
                  <p style={{ fontSize: 12, color: C.muted, margin: '4px 0' }}>
                    {contacts[a.payload.company_id]?.email
                      ? `Será enviado por e-mail para ${contacts[a.payload.company_id].email}`
                      : '⚠ Empresa sem e-mail de contato — cadastre em Empresas → detalhar antes de aprovar.'}
                  </p>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => decide(a.id, 'approve')} disabled={busy === a.id}
                    style={{ background: C.success, color: 'white', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                    Aprovar e executar
                  </button>
                  <button onClick={() => decide(a.id, 'reject')} disabled={busy === a.id}
                    style={{ background: 'none', color: C.critical, border: `1px solid ${C.critical}`, borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                    Rejeitar
                  </button>
                  {waLink(contacts[a.payload?.company_id]?.whatsapp, a.payload?.message) && (
                    <a href={waLink(contacts[a.payload.company_id].whatsapp, a.payload.message)}
                       target="_blank" rel="noreferrer"
                       style={{ background: 'none', color: C.success, border: `1px solid ${C.success}`, borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 800, textDecoration: 'none' }}>
                      Abrir no WhatsApp ↗
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Metas do time */}
      <Card>
        <SectionTitle right={<span style={{ fontSize: 11, color: C.mutedLight }}>revisão semanal às segundas, pelo Chefe de Gabinete</span>}>
          Metas ({goals.length})
        </SectionTitle>
        {goals.length > 0 && (
          <ul style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
            {goals.map(g => {
              const pct = g.current != null && g.target > 0
                ? Math.min(100, Math.round((g.current / g.target) * 100)) : null;
              return (
                <li key={g.id}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 13, flexWrap: 'wrap' }}>
                    <strong style={{ color: C.ink }}>{g.label}</strong>
                    <span style={{ color: C.muted }}>
                      {g.current != null ? `${g.current} / ` : 'alvo: '}{g.target}{g.unit ? ` ${g.unit}` : ''}
                      {g.deadline ? ` · até ${new Date(g.deadline + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''}
                    </span>
                    {g.created_by === 'ceo' && <span style={{ fontSize: 10, fontWeight: 800, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 4, padding: '0 5px' }}>proposta do time</span>}
                    <button onClick={() => archiveGoal(g.id)} disabled={busy === g.id}
                      style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 11, color: C.mutedLight, cursor: 'pointer', textDecoration: 'underline' }}>
                      arquivar
                    </button>
                  </div>
                  {pct != null && (
                    <div style={{ height: 6, background: C.bg, borderRadius: 999, marginTop: 5, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: pct >= 100 ? C.success : C.ink, borderRadius: 999 }} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <form onSubmit={addGoal} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input name="label" placeholder="nova meta (ex: 3 empresas pagantes)" style={{ flex: 2, minWidth: 200, padding: '8px 10px', fontSize: 13, border: `1.5px solid ${C.borderStrong}`, borderRadius: 8, outline: 'none', color: C.ink }} />
          <input name="target" type="number" step="any" placeholder="alvo" style={{ width: 90, padding: '8px 10px', fontSize: 13, border: `1.5px solid ${C.borderStrong}`, borderRadius: 8, outline: 'none', color: C.ink }} />
          <select name="metric" style={{ padding: '8px 10px', fontSize: 13, border: `1.5px solid ${C.borderStrong}`, borderRadius: 8, color: C.ink, background: 'white' }}>
            <option value="custom">acompanhamento manual</option>
            <option value="mrr">MRR (R$)</option>
            <option value="paying_companies">empresas pagantes</option>
            <option value="trials_active">trials ativos</option>
            <option value="checklists_7d">checklists / 7d</option>
            <option value="active_companies_7d">empresas ativas 7d</option>
          </select>
          <input name="unit" placeholder="unidade" style={{ width: 90, padding: '8px 10px', fontSize: 13, border: `1.5px solid ${C.borderStrong}`, borderRadius: 8, outline: 'none', color: C.ink }} />
          <input name="deadline" type="date" style={{ padding: '7px 10px', fontSize: 13, border: `1.5px solid ${C.borderStrong}`, borderRadius: 8, color: C.ink }} />
          <button type="submit" disabled={busy === 'goal'}
            style={{ background: C.ink, color: 'white', border: 'none', borderRadius: 8, padding: '9px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            Adicionar meta
          </button>
        </form>
      </Card>

      <div className="grid lg:grid-cols-3 gap-4 items-start">
        {/* Briefing */}
        <div style={{ gridColumn: 'span 2', display: 'grid', gap: 16 }}>
          <Card>
            <SectionTitle right={briefing && (
              <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
                <Rating reportId={briefing.id} current={briefing.rating} onRate={rate} />
                <span style={{ fontSize: 11, color: C.mutedLight }}>{timeAgo(briefing.created_at)}</span>
              </span>
            )}>
              Briefing do Chefe de Gabinete
            </SectionTitle>
            {!briefing ? <Empty>Nenhum briefing ainda — rode o ciclo ou aguarde o cron das 7h.</Empty>
              : <Md text={briefing.report_md} />}
          </Card>

          {retro && (
            <Card>
              <SectionTitle right={
                <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
                  <Rating reportId={retro.id} current={retro.rating} onRate={rate} />
                  <span style={{ fontSize: 11, color: C.mutedLight }}>{timeAgo(retro.created_at)}</span>
                </span>
              }>
                Retrospectiva semanal (auto-avaliação)
              </SectionTitle>
              <Md text={retro.report_md} />
            </Card>
          )}
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          {/* Chat */}
          <Card>
            <SectionTitle>Pergunte aos dados</SectionTitle>
            <form onSubmit={sendQuestion} style={{ display: 'grid', gap: 8 }}>
              <textarea
                value={question} onChange={e => setQuestion(e.target.value)} rows={3}
                placeholder="ex: qual loja do IBR está pior esta semana e por quê?"
                style={{ width: '100%', padding: '10px 12px', fontSize: 13, border: `1.5px solid ${C.borderStrong}`, borderRadius: 8, outline: 'none', color: C.ink, resize: 'vertical' }}
              />
              <button type="submit" disabled={busy === 'ask' || !hasApiKey}
                style={{ background: hasApiKey ? C.ink : C.mutedLight, color: 'white', border: 'none', borderRadius: 8, padding: '9px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {busy === 'ask' ? 'O time está analisando…' : 'Perguntar'}
              </button>
            </form>
            {chat && (
              <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: 'white', background: C.ink, borderRadius: 4, padding: '2px 6px' }}>
                    {chat.agentName}
                  </span>
                  {chat.reportId && (
                    <Rating reportId={chat.reportId} current={chat.rated || null}
                      onRate={(id, val) => { setChat(c => ({ ...c, rated: val })); rate(id, val); }} />
                  )}
                </div>
                <div style={{ marginTop: 8 }}><Md text={chat.answer} /></div>
              </div>
            )}
          </Card>

          {/* Memória do time */}
          <Card>
            <SectionTitle>Memória do time</SectionTitle>
            {memories.length === 0 ? <Empty>Sem lições ainda — nascem dos ciclos.</Empty> : (
              <ul style={{ display: 'grid', gap: 6 }}>
                {memories.map((m, i) => (
                  <li key={i} style={{ fontSize: 12, color: C.muted, borderBottom: `1px solid ${C.border}`, paddingBottom: 6 }}>
                    <strong style={{ color: C.ink }}>{agents[m.agent] || m.agent}:</strong> {m.content}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Refinos de prompt aprovados (auto-melhoria) */}
          {refinements.length > 0 && (
            <Card>
              <SectionTitle>Diretrizes refinadas</SectionTitle>
              <ul style={{ display: 'grid', gap: 6 }}>
                {refinements.map((r, i) => (
                  <li key={i} style={{ fontSize: 12, color: C.muted, borderBottom: `1px solid ${C.border}`, paddingBottom: 6 }}>
                    <strong style={{ color: C.ink }}>{agents[r.agent] || r.agent}:</strong> {r.system_md}
                    <span style={{ display: 'block', fontSize: 11, color: C.mutedLight }}>{timeAgo(r.created_at)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      {/* Ações recentes + histórico */}
      <div className="grid md:grid-cols-2 gap-4 items-start">
        <Card>
          <SectionTitle>Ações recentes do time</SectionTitle>
          {recentActions.length === 0 ? <Empty>Nenhuma ação executada ainda.</Empty> : (
            <ul style={{ display: 'grid', gap: 6 }}>
              {recentActions.map(a => {
                const draft = a.result?.draft || (a.action_type === 'draft_message' && a.payload?.message);
                return (
                  <li key={a.id} style={{ fontSize: 12, color: C.muted, borderBottom: `1px solid ${C.border}`, paddingBottom: 6 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                      <span style={{ fontSize: 10, fontWeight: 800, borderRadius: 4, padding: '1px 6px', color: 'white',
                        background: a.status === 'executed' ? C.success : a.status === 'rejected' ? C.mutedLight : C.critical }}>
                        {a.status === 'executed' ? 'FEITO' : a.status === 'rejected' ? 'REJEITADO' : 'FALHOU'}
                      </span>
                      <span style={{ color: C.ink }}>{ACTION_LABELS[a.action_type] || a.action_type}
                        {a.payload?.company_id ? ` → ${a.payload.company_id}` : ''}</span>
                      <span style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 11, color: C.mutedLight }}>{timeAgo(a.decided_at || a.created_at)}</span>
                    </div>
                    {draft && (
                      <div style={{ marginTop: 4, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <p style={{ flex: 1, fontSize: 12, color: C.ink, background: C.bg, borderRadius: 6, padding: '6px 8px' }}>
                          “{draft}”
                        </p>
                        <span style={{ flexShrink: 0, display: 'grid', gap: 4 }}>
                          <button
                            onClick={() => navigator.clipboard?.writeText(draft)}
                            style={{ background: 'none', border: `1px solid ${C.borderStrong}`, borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 700, color: C.ink, cursor: 'pointer' }}>
                            copiar
                          </button>
                          {waLink(contacts[a.payload?.company_id]?.whatsapp, draft) && (
                            <a href={waLink(contacts[a.payload.company_id].whatsapp, draft)} target="_blank" rel="noreferrer"
                               style={{ textAlign: 'center', background: 'none', border: `1px solid ${C.success}`, borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 700, color: C.success, textDecoration: 'none' }}>
                              WhatsApp ↗
                            </a>
                          )}
                        </span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <SectionTitle>Histórico de produção</SectionTitle>
          {reports.length === 0 ? <Empty /> : (
            <ul style={{ display: 'grid', gap: 6 }}>
              {reports.map(r => (
                <li key={r.id} style={{ fontSize: 12, color: C.muted, display: 'flex', gap: 8, alignItems: 'baseline', borderBottom: `1px solid ${C.border}`, paddingBottom: 6 }}>
                  <strong style={{ color: C.ink, flexShrink: 0 }}>{agents[r.agent] || r.agent}</strong>
                  <span>{r.kind === 'briefing' ? 'briefing diário' : r.kind === 'retro' ? 'retrospectiva semanal' : r.kind === 'analysis' ? 'análise' : `“${(r.question || '').slice(0, 60)}”`}</span>
                  <span style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 11, color: C.mutedLight }}>{timeAgo(r.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
