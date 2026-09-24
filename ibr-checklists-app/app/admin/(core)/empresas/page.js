'use client';
import { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { C } from '../../../../lib/tokens';
import { normalizeCnpj, formatCnpj, cnpjError } from '../../../../lib/cnpj';
import { formatBRL, extraSeatsInUse, EXTRA_USER_PRICE, INCLUDED_USERS_PER_UNIT } from '../../../../lib/plans';
import {
  useAdminData, Card, Kpi, SectionTitle, HealthDot, UpdatedAt, ErrorBox, Loading,
  Empty, ChartTip, Table, fmtDay, timeAgo,
} from '../ui';

// Dados cadastrais: CNPJ (a identidade da conta e a trava do trial), razão
// social e o canal que o time de agentes usa para follow-up real (e-mail via
// Brevo) e WhatsApp 1-clique.
function ContactEditor({ company, busy, onSave }) {
  const [cnpj, setCnpj] = useState(company.cnpj || '');
  const [legalName, setLegalName] = useState(company.legal_name || '');
  const [contactName, setContactName] = useState(company.contact_name || '');
  const [email, setEmail] = useState(company.contact_email || '');
  const [whatsapp, setWhatsapp] = useState(company.contact_whatsapp || '');

  const cnpjMsg = cnpj ? cnpjError(cnpj) : null;
  const invalid = !!cnpjMsg && cnpj.length === 14;
  const dirty = cnpj !== (company.cnpj || '')
    || legalName !== (company.legal_name || '')
    || contactName !== (company.contact_name || '')
    || email !== (company.contact_email || '')
    || whatsapp !== (company.contact_whatsapp || '');

  const input = {
    flex: 1, minWidth: 160, padding: '8px 10px', fontSize: 13,
    border: `1.5px solid ${C.borderStrong}`, borderRadius: 8, outline: 'none', color: C.ink,
  };
  const rotulo = {
    fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase',
    letterSpacing: '0.05em', flexBasis: '100%', margin: 0,
  };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <p style={rotulo}>Identificação</p>
      <input style={{ ...input, maxWidth: 210, borderColor: invalid ? C.critical : C.borderStrong }}
             placeholder="CNPJ" value={formatCnpj(cnpj)}
             onChange={e => setCnpj(normalizeCnpj(e.target.value).slice(0, 14))} />
      <input style={input} placeholder="razão social"
             value={legalName} onChange={e => setLegalName(e.target.value)} />
      {invalid && (
        <p style={{ fontSize: 12, color: C.critical, fontWeight: 600, flexBasis: '100%', margin: 0 }}>{cnpjMsg}</p>
      )}

      <p style={{ ...rotulo, marginTop: 6 }}>Responsável</p>
      <input style={input} placeholder="nome do responsável"
             value={contactName} onChange={e => setContactName(e.target.value)} />
      <input style={input} type="email" placeholder="e-mail"
             value={email} onChange={e => setEmail(e.target.value)} />
      <input style={input} inputMode="tel" placeholder="WhatsApp (5512988017472)"
             value={whatsapp} onChange={e => setWhatsapp(e.target.value)} />
      <button
        onClick={() => onSave({
          cnpj, legal_name: legalName, contact_name: contactName,
          contact_email: email, contact_whatsapp: whatsapp,
        })}
        disabled={!dirty || !!busy || invalid}
        style={{ background: dirty && !invalid ? C.ink : C.mutedLight, color: 'white', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
        Salvar cadastro
      </button>
    </div>
  );
}

// CNPJ da loja — obrigatório: cada unidade tem identidade fiscal própria
// (lojas do mesmo grupo costumam ser PJs distintas).
function UnitCnpjEditor({ unit, busy, onSave }) {
  const [value, setValue] = useState(unit.cnpj || '');
  const msg = cnpjError(value);
  const invalid = !!msg && value.length === 14;
  const dirty = value !== (unit.cnpj || '');
  const faltando = !unit.cnpj;
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
      <input
        value={formatCnpj(value)}
        onChange={e => setValue(normalizeCnpj(e.target.value).slice(0, 14))}
        placeholder="CNPJ da loja (obrigatório)"
        style={{ flex: 1, minWidth: 170, padding: '5px 8px', fontSize: 12, color: C.ink,
                 border: `1px solid ${invalid || faltando ? C.critical : C.border}`, borderRadius: 6, outline: 'none' }}
      />
      <button
        onClick={() => onSave(value)} disabled={!dirty || !!msg || !!busy}
        style={{ background: 'none', border: `1px solid ${dirty && !msg ? C.ink : C.border}`,
                 color: dirty && !msg ? C.ink : C.mutedLight, borderRadius: 6,
                 padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
        salvar
      </button>
      {invalid && <span style={{ fontSize: 11, color: C.critical, flexBasis: '100%' }}>{msg}</span>}
    </div>
  );
}

// Vagas de usuário (regra de 23/09/2026): 10 por loja ativa, somadas, + as
// adicionais contratadas. Os números vêm da view admin_company_health (ativos
// = não suspensos; lojas que já estrearam) — antes da migration 20260923 as
// colunas não existem e a tela cai na contagem bruta de usuários.
const hasSeats = c => c && c.active_users != null && c.seat_capacity != null;

function SeatsCell({ company }) {
  if (!hasSeats(company)) return <span>{company.users}</span>;
  if (company.billing?.exempt) return <span style={{ color: C.muted }}>{company.active_users} · isenta</span>;
  const over = Number(company.active_users) > Number(company.seat_capacity);
  const extra = company.billing?.extra_seats ?? company.extra_seats ?? 0;
  return (
    <span style={{ color: over ? C.critical : C.ink, fontWeight: over ? 700 : 400 }}>
      {company.active_users}/{company.seat_capacity}
      {extra > 0 && <span style={{ color: C.muted, fontWeight: 400 }}> · +{extra} adic.</span>}
    </span>
  );
}

// Vagas e cobrança no drill-down: em uso / capacidade / adicionais contratadas,
// o valor que o MP cobra e a trilha de quem contratou ou reduziu vagas.
function SeatsCard({ company, changes }) {
  const b = company.billing || {};
  const units = company.active_units_billable ?? 0;
  const inUse = extraSeatsInUse(company.active_users, units);
  const extra = b.extra_seats ?? company.extra_seats ?? 0;
  const over = Number(company.active_users) > Number(company.seat_capacity);
  const linha = { fontSize: 13, color: C.ink, margin: 0 };
  return (
    <Card>
      <SectionTitle right={b.adjust_pending
        ? <span style={{ fontSize: 11, fontWeight: 700, color: C.warning }}>AJUSTE DE VALOR PENDENTE NO MP</span>
        : null}>
        Vagas e cobrança
      </SectionTitle>
      {b.exempt ? (
        <p style={linha}>
          Conta isenta (cortesia) — sem limite de vagas e sem cobrança. {company.active_users} usuários ativos.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 4 }}>
          <p style={{ ...linha, color: over ? C.critical : C.ink, fontWeight: over ? 700 : 400 }}>
            {company.active_users} de {company.seat_capacity} vagas em uso
            {over && ' — acima da capacidade: ninguém novo entra até suspender ou contratar'}
          </p>
          <p style={{ ...linha, color: C.muted }}>
            {company.included_seats} da franquia ({units} {units === 1 ? 'loja ativa' : 'lojas ativas'} × {INCLUDED_USERS_PER_UNIT}, piso de 1 loja)
            {' + '}{extra} adicionais contratadas ({formatBRL(EXTRA_USER_PRICE * extra, { cents: true })}/mês)
            {inUse > 0 && ` · ${inUse} adicionais em uso (mínimo para reduzir)`}
          </p>
          <p style={{ ...linha, color: C.muted }}>
            Cobrado no Mercado Pago: {b.billed_amount != null
              ? `${formatBRL(b.billed_amount)}/mês${b.billed_cycle ? ` · ${b.billed_cycle === 'monthly' ? 'mensal' : 'anual'}` : ''}`
              : 'sem valor registrado'}
          </p>
        </div>
      )}
      {changes.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Table
            head={['Quando', 'Quem', 'Vagas adicionais', 'Ativos / franquia', 'Origem']}
            rows={changes.map(ch => [
              ch.created_at ? new Date(ch.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—',
              ch.changed_by_name || ch.changed_by || '—',
              `${ch.from_seats ?? 0} → ${ch.to_seats ?? 0} (${formatBRL(ch.unit_price ?? EXTRA_USER_PRICE, { cents: true })} cada)`,
              `${ch.active_users ?? '—'} / ${ch.included_seats ?? '—'}`,
              <span key="o" style={{ fontSize: 12, color: C.muted }}>{ch.source || '—'}</span>,
            ])}
          />
        </div>
      )}
    </Card>
  );
}

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
            : action === 'set_contact' ? 'Cadastro salvo — o CNPJ ficou vinculado a este cliente.'
            : action === 'set_unit_cnpj' ? 'CNPJ da loja salvo e vinculado ao grupo.'
            : action === 'set_billing_mode' ? `Faturamento definido: ${data.billing_mode === 'per_unit' ? 'uma cobrança por loja' : 'uma cobrança para o grupo'}.`
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
  const trialHistory = list.data.trialHistory || [];
  const semCnpj = companies.filter(c => !c.cnpj);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: C.ink }}>Empresas</h1>
        <UpdatedAt updatedAt={list.updatedAt} onRefresh={list.refresh} loading={list.loading} />
      </div>

      {semCnpj.length > 0 && (
        <Card style={{ borderColor: C.warning }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: C.warning }}>
            {semCnpj.length} empresa(s) sem CNPJ cadastrado
          </p>
          <p style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
            {semCnpj.map(c => c.name || c.company_id).join(' · ')} — cadastre o CNPJ
            no detalhe de cada uma. Sem ele a empresa não conta na trava de teste
            gratuito e o time de agentes não tem identidade fiscal para cobrança.
          </p>
        </Card>
      )}

      <Card>
        <SectionTitle>Todas as empresas ({companies.length})</SectionTitle>
        <Table
          head={['Empresa', 'CNPJ', 'Plano', 'Unidades', 'Vagas', 'Checklists 7d', '30d', 'Última atividade', '']}
          empty="Nenhuma empresa provisionada."
          rows={companies.map(c => [
            <span key="n" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <HealthDot status={c.health} />
              <strong>{c.name || c.company_id}</strong>
              <span style={{ color: C.mutedLight, fontSize: 12 }}>{c.slug}</span>
              {!c.active && <span style={{ fontSize: 10, fontWeight: 600, color: C.critical }}>INATIVA</span>}
            </span>,
            <span key="cn" style={{ color: c.cnpj ? C.muted : C.warning, fontSize: 12 }}>
              {c.cnpj ? formatCnpj(c.cnpj) : 'sem CNPJ'}
            </span>,
            <span key="p" style={{ color: C.muted }}>
              {c.subscription_status === 'trialing'
                ? `trial até ${c.trial_ends_at ? fmtDay(c.trial_ends_at.slice(0, 10)) : '—'}`
                : (c.subscription_status || c.plan || '—')}
            </span>,
            c.units, <SeatsCell key="v" company={c} />, c.completions_7d, c.completions_30d,
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
              <h2 style={{ fontSize: 16, fontWeight: 600, color: C.ink }}>
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
                    style={{ background: deleteConfirm.trim() === detail.data.company.slug ? C.critical : C.mutedLight, color: 'white', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                  >
                    {busy === 'delete' ? 'Deletando…' : 'Deletar definitivamente'}
                  </button>
                </div>
              </Card>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi label="Unidades" value={detail.data.company.units} />
              {hasSeats(detail.data.company) ? (
                <Kpi label="Vagas em uso"
                     value={`${detail.data.company.active_users}/${detail.data.company.seat_capacity}`}
                     sub={detail.data.company.billing?.exempt ? 'isenta (cortesia)'
                       : `${detail.data.company.billing?.extra_seats ?? detail.data.company.extra_seats ?? 0} adicionais contratadas`} />
              ) : (
                <Kpi label="Usuários" value={detail.data.company.users} />
              )}
              <Kpi label="Checklists 30d" value={detail.data.company.completions_30d} />
              <Kpi label="Última atividade" value={timeAgo(detail.data.company.last_activity)} />
            </div>

            {hasSeats(detail.data.company) && (
              <SeatsCard company={detail.data.company} changes={detail.data.seatChanges || []} />
            )}

            <Card style={{ padding: 12 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Faturamento
                </span>
                {[['group', 'Uma cobrança para o grupo'], ['per_unit', 'Uma cobrança por loja/CNPJ']].map(([mode, rotulo]) => {
                  const ativo = (detail.data.company.billing_mode || 'group') === mode;
                  return (
                    <button key={mode}
                      onClick={() => !ativo && act(selected, 'set_billing_mode', { billing_mode: mode })}
                      disabled={!!busy}
                      style={{ background: ativo ? C.ink : 'none', color: ativo ? 'white' : C.ink,
                               border: `1px solid ${ativo ? C.ink : C.borderStrong}`, borderRadius: 8,
                               padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: ativo ? 'default' : 'pointer' }}>
                      {rotulo}
                    </button>
                  );
                })}
              </div>
            </Card>

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
                        <UnitCnpjEditor
                          key={u.unit_id + (u.cnpj || '')}
                          unit={u} busy={busy}
                          onSave={cnpj => act(selected, 'set_unit_cnpj', { unit_id: u.unit_id, cnpj })}
                        />
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

      {/* Trava anti-reuso: o histórico sobrevive à deleção da empresa */}
      <Card>
        <SectionTitle right={<span style={{ fontSize: 11, color: C.mutedLight }}>um CNPJ pertence a um cliente só</span>}>
          CNPJs vinculados a clientes ({trialHistory.length})
        </SectionTitle>
        <Table
          head={['CNPJ', 'Origem', 'Cliente', 'Início', 'Situação']}
          empty="Nenhum CNPJ vinculado ainda."
          rows={trialHistory.map(t => [
            <span key="c" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{formatCnpj(t.cnpj)}</span>,
            <span key="o" style={{ fontSize: 12, color: C.muted }}>{t.source === 'unit' ? 'loja' : 'empresa'}</span>,
            t.company_name || t.origin_company_id || '—',
            t.started_at ? new Date(t.started_at).toLocaleDateString('pt-BR') : '—',
            <span key="s" style={{ color: t.outcome === 'deleted' ? C.critical : C.muted, fontSize: 12 }}>
              {t.outcome === 'deleted' ? 'empresa deletada — trava mantida'
                : t.outcome === 'converted' ? 'converteu'
                : t.ended_at ? 'encerrado' : 'em uso'}
            </span>,
          ])}
        />
        <p style={{ fontSize: 12, color: C.mutedLight, marginTop: 10 }}>
          Cada CNPJ — da empresa ou de qualquer loja — fica vinculado a um cliente.
          Tentar usar um deles para abrir outra conta é recusado, e o teste gratuito
          é do grupo inteiro, não de cada CNPJ. Para liberar um novo teste ao mesmo
          grupo, use a opção em Config ao criar a empresa.
        </p>
      </Card>
    </div>
  );
}
