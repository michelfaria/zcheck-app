'use client';
import { useState } from 'react';

// Contato da empresa — o canal que o time de agentes usa para follow-up real
// (e-mail via Brevo) e para o link 1-clique de WhatsApp.
function ContactEditor({ company, busy, onSave }) {
  const [email, setEmail] = useState(company.contact_email || '');
  const [whatsapp, setWhatsapp] = useState(company.contact_whatsapp || '');
  const dirty = email !== (company.contact_email || '') || whatsapp !== (company.contact_whatsapp || '');
  const input = {
    flex: 1, minWidth: 170, padding: '8px 10px', fontSize: 13,
    border: `1.5px solid ${C.borderStrong}`, borderRadius: 8, outline: 'none', color: C.ink,
  };
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Contato
      </span>
      <input style={input} type="email" placeholder="email do gestor"
             value={email} onChange={e => setEmail(e.target.value)} />
      <input style={input} inputMode="tel" placeholder="WhatsApp (ex: 5512988017472)"
             value={whatsapp} onChange={e => setWhatsapp(e.target.value)} />
      <button
        onClick={() => onSave({ contact_email: email, contact_whatsapp: whatsapp })}
        disabled={!dirty || !!busy}
        style={{ background: dirty ? C.ink : C.mutedLight, color: 'white', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
        Salvar contato
      </button>
    </div>
  );
}
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { C } from '../../../../lib/tokens';
import {
  useAdminData, Card, Kpi, SectionTitle, HealthDot, UpdatedAt, ErrorBox, Loading,
  Empty, ChartTip, Table, fmtDay, timeAgo,
} from '../ui';

// Empresas — gestão de tenants: drill-down (unidades → setores, usuários) e
// ações de gestão (ativar/desativar, +7 dias de trial, deletar).
export default function CompaniesPage() {
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(null);        // ação em andamento
  const [feedback, setFeedback] = useState(null); // { ok, message }
  const [deleteConfirm, setDeleteConfirm] = useState(''); // slug digitada
  const [deleteArmed, setDeleteArmed] = useState(false);
  const list = useAdminData('/api/admin/companies', 60000);
  const detail = useAdminData(
    selected ? `/api/admin/companies?company_id=${encodeURIComponent(selected)}` : null,
    60000
  );

  async function act(companyId, action, extra = {}) {
    setBusy(action);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/companies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: companyId, action, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setFeedback({ ok: false, message: data.message || data.reason || 'a ação falhou' });
        return false;
      }
      if (action === 'delete') {
        setSelected(null);
        setDeleteArmed(false);
        setDeleteConfirm('');
        setFeedback({ ok: true, message: 'Empresa deletada com todos os dados.' });
      } else {
        setFeedback({
          ok: true,
          message: action === 'extend_trial'
            ? `Trial estendido até ${new Date(data.trial_ends_at).toLocaleDateString('pt-BR')}.`
            : action === 'set_contact' ? 'Contato salvo — o time de agentes já pode usar este canal.'
            : data.active ? 'Empresa reativada — o login volta a funcionar.' : 'Empresa desativada — o login foi bloqueado.',
        });
      }
      await list.refresh();
      if (action !== 'delete') await detail.refresh();
      return true;
    } finally {
      setBusy(null);
    }
  }

  if (list.loading && !list.data) return <Loading />;
  if (list.error && !list.data) return <ErrorBox message={list.error} onRetry={list.refresh} />;
  const companies = list.data.companies;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: C.ink }}>Empresas</h1>
        <UpdatedAt updatedAt={list.updatedAt} onRefresh={list.refresh} loading={list.loading} />
      </div>

      <Card>
        <SectionTitle>Todas as empresas ({companies.length})</SectionTitle>
        <Table
          head={['Empresa', 'Plano', 'Unidades', 'Usuários', 'Checklists 7d', '30d', 'Última atividade', '']}
          empty="Nenhuma empresa provisionada."
          rows={companies.map(c => [
            <span key="n" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <HealthDot status={c.health} />
              <strong>{c.name || c.company_id}</strong>
              <span style={{ color: C.mutedLight, fontSize: 12 }}>{c.slug}</span>
              {!c.active && <span style={{ fontSize: 10, fontWeight: 800, color: C.critical }}>INATIVA</span>}
            </span>,
            <span key="p" style={{ color: C.muted }}>
              {c.subscription_status === 'trialing'
                ? `trial até ${c.trial_ends_at ? fmtDay(c.trial_ends_at.slice(0, 10)) : '—'}`
                : (c.subscription_status || c.plan || '—')}
            </span>,
            c.units, c.users, c.completions_7d, c.completions_30d,
            timeAgo(c.last_activity),
            <button key="b"
              onClick={() => setSelected(selected === c.company_id ? null : c.company_id)}
              style={{ background: selected === c.company_id ? C.ink : 'none',
                       color: selected === c.company_id ? 'white' : C.ink,
                       border: `1px solid ${selected === c.company_id ? C.ink : C.borderStrong}`,
                       borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              {selected === c.company_id ? 'fechar' : 'detalhar'}
            </button>,
          ])}
        />
      </Card>

      {feedback && (
        <Card style={{ borderColor: feedback.ok ? C.success : C.critical, padding: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: feedback.ok ? C.success : C.critical }}>
            {feedback.message}
          </p>
        </Card>
      )}

      {selected && (
        detail.loading && !detail.data ? <Loading /> :
        detail.error && !detail.data ? <ErrorBox message={detail.error} onRetry={detail.refresh} /> :
        detail.data && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: C.ink }}>
                {detail.data.company.name || selected}
              </h2>
              <HealthDot status={detail.data.company.health} withLabel />

              {/* Ações de gestão */}
              <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={() => act(selected, detail.data.company.active ? 'deactivate' : 'activate')}
                  disabled={!!busy}
                  style={{ background: 'none', border: `1px solid ${C.borderStrong}`, borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, color: C.ink, cursor: 'pointer' }}
                >
                  {busy === 'activate' || busy === 'deactivate' ? '…'
                    : detail.data.company.active ? 'Desativar acesso' : 'Reativar acesso'}
                </button>
                <button
                  onClick={() => act(selected, 'extend_trial')}
                  disabled={!!busy}
                  style={{ background: 'none', border: `1px solid ${C.borderStrong}`, borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, color: C.ink, cursor: 'pointer' }}
                >
                  {busy === 'extend_trial' ? '…' : '+7 dias de teste'}
                </button>
                <button
                  onClick={() => { setDeleteArmed(a => !a); setDeleteConfirm(''); }}
                  disabled={!!busy}
                  style={{ background: deleteArmed ? C.critical : 'none', border: `1px solid ${C.critical}`, borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, color: deleteArmed ? 'white' : C.critical, cursor: 'pointer' }}
                >
                  {deleteArmed ? 'Cancelar' : 'Deletar…'}
                </button>
              </span>
            </div>

            {deleteArmed && (
              <Card style={{ borderColor: C.critical }}>
                <p style={{ fontSize: 13, color: C.ink, fontWeight: 700, marginBottom: 6 }}>
                  Deletar apaga a empresa e TODOS os dados dela (unidades, usuários,
                  checklists, histórico, eventos). Não tem volta.
                </p>
                <p style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>
                  Para confirmar, digite a slug <strong>{detail.data.company.slug}</strong>:
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input
                    value={deleteConfirm}
                    onChange={e => setDeleteConfirm(e.target.value)}
                    placeholder={detail.data.company.slug}
                    style={{ flex: 1, minWidth: 180, padding: '9px 12px', fontSize: 14, border: `1.5px solid ${C.borderStrong}`, borderRadius: 8, outline: 'none', color: C.ink }}
                  />
                  <button
                    onClick={() => act(selected, 'delete', { confirm: deleteConfirm.trim() })}
                    disabled={busy === 'delete' || deleteConfirm.trim() !== detail.data.company.slug}
                    style={{ background: deleteConfirm.trim() === detail.data.company.slug ? C.critical : C.mutedLight, color: 'white', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
                  >
                    {busy === 'delete' ? 'Deletando…' : 'Deletar definitivamente'}
                  </button>
                </div>
              </Card>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi label="Unidades" value={detail.data.company.units} />
              <Kpi label="Usuários" value={detail.data.company.users} />
              <Kpi label="Checklists 30d" value={detail.data.company.completions_30d} />
              <Kpi label="Última atividade" value={timeAgo(detail.data.company.last_activity)} />
            </div>

            <Card style={{ padding: 12 }}>
              <ContactEditor
                key={selected + (detail.data.company.contact_email || '') + (detail.data.company.contact_whatsapp || '')}
                company={detail.data.company}
                busy={busy}
                onSave={fields => act(selected, 'set_contact', fields)}
              />
            </Card>

            <Card>
              <SectionTitle>Checklists e usuários ativos por dia (30d)</SectionTitle>
              <div style={{ width: '100%', height: 180 }}>
                <ResponsiveContainer>
                  <AreaChart data={detail.data.series} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke={C.border} vertical={false} />
                    <XAxis dataKey="day" tickFormatter={fmtDay} tick={{ fontSize: 11, fill: C.mutedLight }}
                           axisLine={{ stroke: C.border }} tickLine={false} minTickGap={28} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.mutedLight }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTip labelFormatter={fmtDay} />} />
                    <Area type="monotone" dataKey="completions" name="checklists" stroke={C.ink}
                          strokeWidth={2} fill={C.ink} fillOpacity={0.08} dot={false} activeDot={{ r: 4 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <div className="grid md:grid-cols-2 gap-4 items-start">
              <Card>
                <SectionTitle>Unidades e setores</SectionTitle>
                {detail.data.units.length === 0 ? <Empty>Sem unidades — empresa ainda em onboarding.</Empty> : (
                  <ul style={{ display: 'grid', gap: 10 }}>
                    {detail.data.units.map(u => (
                      <li key={u.unit_id} style={{ borderBottom: `1px solid ${C.border}`, paddingBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: C.ink }}>
                          <HealthDot status={u.health} />
                          {u.name || u.unit_id}
                          <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: C.muted }}>
                            {u.completions_30d} em 30d · último {timeAgo(u.last_completion)}
                          </span>
                        </div>
                        {u.sectors?.length > 0 && (
                          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
                            {u.sectors.join(' · ')}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card>
                <SectionTitle>Usuários (por conclusões, 30d)</SectionTitle>
                <Table
                  head={['Usuário', 'Papel', '30d', 'Último']}
                  empty="Nenhuma conclusão registrada."
                  rows={detail.data.users.map(u => [
                    u.name || u.user_id,
                    <span key="r" style={{ color: C.muted }}>{u.role || '—'}</span>,
                    u.completions_30d,
                    timeAgo(u.last_completion),
                  ])}
                />
              </Card>
            </div>
          </>
        )
      )}
    </div>
  );
}
