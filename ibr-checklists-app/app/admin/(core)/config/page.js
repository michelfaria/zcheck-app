'use client';
import { useState } from 'react';
import { C } from '../../../../lib/tokens';
import { normalizeCnpj, formatCnpj, cnpjError } from '../../../../lib/cnpj';
import {
  useAdminData, Card, SectionTitle, UpdatedAt, ErrorBox, Loading, Empty, Table,
} from '../ui';

const input = {
  width: '100%', padding: '10px 12px', fontSize: 14,
  border: `1.5px solid ${C.borderStrong}`, borderRadius: 8,
  outline: 'none', color: C.ink, background: 'white',
};
const label = {
  display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: C.muted, margin: '12px 0 5px',
};

// ── Administradores do Core ──────────────────────────────────────────────────
// Quem entra no /admin. Adicionar alguém cria a conta no Supabase Auth E põe na
// lista de platform_admins numa tacada — antes eram dois passos manuais (painel
// do Supabase + INSERT no SQL Editor).
function AdminsCard() {
  const admins = useAdminData('/api/admin/admins', 120000);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [credential, setCredential] = useState(null); // { email, password } — mostrado UMA vez

  async function call(payload, method = 'POST', qs = '') {
    const res = await fetch(`/api/admin/admins${qs}`, {
      method,
      ...(method === 'POST' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.message || data.reason || `HTTP ${res.status}`);
    return data;
  }

  async function addAdmin(e) {
    e.preventDefault();
    setBusy('create'); setMsg(null); setCredential(null);
    try {
      const data = await call({ action: 'create', email: email.trim() });
      setEmail('');
      if (data.password) {
        setCredential({ email: data.email, password: data.password });
        setMsg({ ok: true, message: 'Acesso criado. Copie a senha agora — ela não aparece de novo.' });
      } else {
        setMsg({ ok: true, message: `${data.email} já tinha conta no ZCheck e agora entra no Core com a senha que já usa.` });
      }
      await admins.refresh();
    } catch (err) {
      setMsg({ ok: false, message: err.message });
    } finally { setBusy(null); }
  }

  async function resetPassword(row) {
    setBusy(row.user_id); setMsg(null); setCredential(null);
    try {
      const data = await call({ action: 'reset_password', user_id: row.user_id });
      setCredential({ email: data.email, password: data.password });
      setMsg({ ok: true, message: 'Senha nova gerada. Copie agora — ela não aparece de novo.' });
    } catch (err) {
      setMsg({ ok: false, message: err.message });
    } finally { setBusy(null); }
  }

  async function removeAdmin(row) {
    if (!window.confirm(`Tirar o acesso de ${row.email} ao ZCheck Core?`)) return;
    setBusy(row.user_id); setMsg(null); setCredential(null);
    try {
      await call(null, 'DELETE', `?user_id=${encodeURIComponent(row.user_id)}`);
      setMsg({ ok: true, message: `${row.email} não entra mais no Core.` });
      await admins.refresh();
    } catch (err) {
      setMsg({ ok: false, message: err.message });
    } finally { setBusy(null); }
  }

  return (
    <Card>
      <SectionTitle>Administradores do Core</SectionTitle>
      <p style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>
        Quem tem acesso a este painel. O acesso ao Core é separado do login das
        empresas: aqui é e-mail e senha, lá é PIN.
      </p>

      <form onSubmit={addAdmin} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <input
          style={{ ...input, flex: 1, minWidth: 180 }} type="email" value={email}
          onChange={e => { setEmail(e.target.value); setMsg(null); }}
          placeholder="e-mail do novo administrador"
        />
        <button
          type="submit" disabled={busy === 'create' || !email.trim()}
          style={{ background: C.ink, color: 'white', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: busy === 'create' ? 0.6 : 1 }}
        >
          {busy === 'create' ? 'Criando…' : 'Dar acesso'}
        </button>
      </form>

      {msg && (
        <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: msg.ok ? C.success : C.critical }}>
          {msg.message}
        </p>
      )}

      {credential && (
        <div style={{ background: C.bg, border: `1px solid ${C.borderStrong}`, borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Senha provisória de {credential.email}
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.ink, fontFamily: 'ui-monospace, monospace', margin: '6px 0' }}>
            {credential.password}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => navigator.clipboard?.writeText(credential.password)}
              style={{ background: 'none', border: `1px solid ${C.borderStrong}`, borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 700, color: C.ink, cursor: 'pointer' }}
            >
              copiar
            </button>
            <button
              onClick={() => setCredential(null)}
              style={{ background: 'none', border: 'none', fontSize: 12, fontWeight: 700, color: C.muted, cursor: 'pointer' }}
            >
              já guardei
            </button>
          </div>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>
            Passe por um canal seguro (não por e-mail) e peça que troque no
            primeiro acesso, em “Minha senha”.
          </p>
        </div>
      )}

      {admins.loading && !admins.data ? <Loading /> :
       admins.error && !admins.data ? <ErrorBox message={admins.error} onRetry={admins.refresh} /> : (
        <Table
          head={['E-mail', 'Último acesso', '']}
          empty="Nenhum administrador cadastrado."
          rows={(admins.data?.admins || []).map(a => [
            <span key="e">
              {a.email}{a.isMe && <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}> · você</span>}
            </span>,
            a.last_sign_in_at
              ? new Date(a.last_sign_in_at).toLocaleDateString('pt-BR')
              : <span key="n" style={{ color: C.mutedLight }}>nunca entrou</span>,
            <span key="x" style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
              <button
                onClick={() => resetPassword(a)} disabled={busy === a.user_id}
                style={{ background: 'none', border: `1px solid ${C.borderStrong}`, borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 700, color: C.ink, cursor: 'pointer' }}
              >
                nova senha
              </button>
              {!a.isMe && (
                <button
                  onClick={() => removeAdmin(a)} disabled={busy === a.user_id}
                  style={{ background: 'none', border: `1px solid ${C.borderStrong}`, borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 700, color: C.critical, cursor: 'pointer' }}
                >
                  remover
                </button>
              )}
            </span>,
          ])}
        />
      )}
    </Card>
  );
}

// ── Minha senha ──────────────────────────────────────────────────────────────
// A senha atual é conferida no servidor contra o Supabase Auth: o cookie prova
// que a pessoa entrou algum dia, não que é ela quem está no teclado agora.
function MyPasswordCard() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (next !== confirm) { setMsg({ ok: false, message: 'a confirmação não bate com a senha nova' }); return; }
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/admin/admins', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'change_password', current_password: current, new_password: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        const reason = data.reason === 'invalid_credentials' ? 'a senha atual está errada'
          : data.reason === 'rate_limited' ? 'muitas tentativas — espere um pouco'
          : data.message || data.reason || 'não foi possível trocar';
        throw new Error(reason);
      }
      setCurrent(''); setNext(''); setConfirm('');
      setMsg({ ok: true, message: 'Senha trocada. Ela vale no próximo login.' });
    } catch (err) {
      setMsg({ ok: false, message: err.message });
    } finally { setBusy(false); }
  }

  return (
    <Card>
      <SectionTitle>Minha senha</SectionTitle>
      <p style={{ fontSize: 13, color: C.muted }}>
        Troque aqui quando entrar com uma senha provisória. Mínimo de 12
        caracteres.
      </p>
      <form onSubmit={submit}>
        <label style={label}>Senha atual</label>
        <input style={input} type="password" value={current} autoComplete="current-password"
               onChange={e => { setCurrent(e.target.value); setMsg(null); }} />
        <label style={label}>Senha nova</label>
        <input style={input} type="password" value={next} autoComplete="new-password"
               onChange={e => { setNext(e.target.value); setMsg(null); }} />
        <label style={label}>Repita a senha nova</label>
        <input style={input} type="password" value={confirm} autoComplete="new-password"
               onChange={e => { setConfirm(e.target.value); setMsg(null); }} />
        {msg && (
          <p style={{ fontSize: 13, fontWeight: 700, marginTop: 10, color: msg.ok ? C.success : C.critical }}>
            {msg.message}
          </p>
        )}
        <button
          type="submit" disabled={busy || !current || next.length < 12}
          style={{ marginTop: 14, width: '100%', padding: 11, background: busy || next.length < 12 ? C.muted : C.ink, color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
        >
          {busy ? 'Trocando…' : 'Trocar senha'}
        </button>
      </form>
    </Card>
  );
}

// Centro de ajustes: criar empresa pelo painel + códigos de acesso do /entrar.
export default function ConfigPage() {
  const codes = useAdminData('/api/admin/company-codes', 120000);

  // ── Criar empresa ─────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    name: '', slug: '', adminName: '', adminPin: '',
    cnpj: '', legalName: '', contactName: '', contactEmail: '', contactWhatsapp: '',
    skipCnpj: false, allowTrialReuse: false,
  });
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null); // { ok, message, accessUrl? }
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setCreated(null); };

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true); setCreated(null);
    try {
      const res = await fetch('/api/admin/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setCreated({ ok: true, message: `Empresa criada. Gestor: ${form.adminName} (PIN escolhido). Acesso:`, accessUrl: data.accessUrl });
        setForm({
          name: '', slug: '', adminName: '', adminPin: '',
          cnpj: '', legalName: '', contactName: '', contactEmail: '', contactWhatsapp: '',
          skipCnpj: false, allowTrialReuse: false,
        });
        codes.refresh();
      } else {
        setCreated({ ok: false, message: data.message || data.reason || 'não foi possível criar' });
      }
    } catch {
      setCreated({ ok: false, message: 'falha de rede — tente de novo' });
    }
    setCreating(false);
  }

  // ── Códigos de acesso ─────────────────────────────────────────────────────
  const [newCode, setNewCode] = useState('');
  const [newCodeCompany, setNewCodeCompany] = useState('');
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeMsg, setCodeMsg] = useState(null);

  async function addCode(e) {
    e.preventDefault();
    if (!newCode.trim() || !newCodeCompany) { setCodeMsg({ ok: false, message: 'preencha código e empresa' }); return; }
    setCodeBusy(true); setCodeMsg(null);
    try {
      const res = await fetch('/api/admin/company-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: newCode, company_id: newCodeCompany }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setNewCode('');
        setCodeMsg({ ok: true, message: 'código adicionado' });
        await codes.refresh();
      } else {
        setCodeMsg({ ok: false, message: data.message || data.reason || 'falhou' });
      }
    } finally { setCodeBusy(false); }
  }

  async function removeCode(code) {
    setCodeBusy(true); setCodeMsg(null);
    try {
      await fetch(`/api/admin/company-codes?code=${encodeURIComponent(code)}`, { method: 'DELETE' });
      await codes.refresh();
    } finally { setCodeBusy(false); }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: C.ink }}>Config</h1>
        <UpdatedAt updatedAt={codes.updatedAt} onRefresh={codes.refresh} loading={codes.loading} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        {/* Criar empresa */}
        <Card>
          <SectionTitle>Criar empresa</SectionTitle>
          <p style={{ fontSize: 13, color: C.muted }}>
            O CNPJ é a identidade da conta e trava o teste gratuito por grupo
            econômico. As lojas são configuradas pelo próprio gestor no
            onboarding guiado do app.
          </p>
          <form onSubmit={handleCreate}>
            <label style={label}>CNPJ</label>
            <input
              style={{ ...input, borderColor: form.skipCnpj ? C.border : (form.cnpj && cnpjError(form.cnpj) ? C.critical : C.borderStrong) }}
              value={formatCnpj(form.cnpj)} disabled={form.skipCnpj}
              onChange={e => set('cnpj', normalizeCnpj(e.target.value).slice(0, 14))}
              placeholder="00.000.000/0001-00" />
            {!form.skipCnpj && form.cnpj.length === 14 && cnpjError(form.cnpj) && (
              <p style={{ fontSize: 12, color: C.critical, fontWeight: 600, marginTop: 4 }}>{cnpjError(form.cnpj)}</p>
            )}
            <label style={{ ...label, textTransform: 'none', letterSpacing: 0, fontSize: 13, fontWeight: 500, color: C.ink, display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0 0' }}>
              <input type="checkbox" checked={form.skipCnpj} onChange={e => set('skipCnpj', e.target.checked)} />
              Criar sem CNPJ (cortesia / parceria)
            </label>
            <label style={{ ...label, textTransform: 'none', letterSpacing: 0, fontSize: 13, fontWeight: 500, color: C.ink, display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0 0' }}>
              <input type="checkbox" checked={form.allowTrialReuse} onChange={e => set('allowTrialReuse', e.target.checked)} />
              Liberar novo teste para este CNPJ
            </label>

            <label style={label}>Razão social</label>
            <input style={input} value={form.legalName} onChange={e => set('legalName', e.target.value)} placeholder="ex: Padaria Sol Comércio LTDA" />
            <label style={label}>Nome da empresa</label>
            <input style={input} value={form.name} onChange={e => set('name', e.target.value)} placeholder="ex: Padaria Sol" />
            <label style={label}>Código / subdomínio (slug)</label>
            <input style={input} value={form.slug}
                   onChange={e => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                   placeholder="ex: padaria-sol" />
            <label style={label}>Responsável pela conta</label>
            <input style={input} value={form.contactName} onChange={e => set('contactName', e.target.value)} placeholder="ex: Maria Souza" />
            <label style={label}>E-mail de contato</label>
            <input style={input} type="email" value={form.contactEmail} onChange={e => set('contactEmail', e.target.value)} placeholder="maria@empresa.com.br" />
            <label style={label}>WhatsApp</label>
            <input style={input} value={form.contactWhatsapp}
                   onChange={e => set('contactWhatsapp', e.target.value.replace(/\D/g, '').slice(0, 13))}
                   placeholder="5511999998888" />

            <label style={label}>Nome do gestor (login no app)</label>
            <input style={input} value={form.adminName} onChange={e => set('adminName', e.target.value)} placeholder="ex: Maria" />
            <label style={label}>PIN do gestor (4 dígitos)</label>
            <input style={input} value={form.adminPin} inputMode="numeric" maxLength={4}
                   onChange={e => set('adminPin', e.target.value.replace(/\D/g, ''))} placeholder="0000" />
            {created && (
              <p style={{ fontSize: 13, fontWeight: 700, marginTop: 10, color: created.ok ? C.success : C.critical }}>
                {created.message}{' '}
                {created.accessUrl && <a href={created.accessUrl} target="_blank" rel="noreferrer" style={{ color: C.ink }}>{created.accessUrl}</a>}
              </p>
            )}
            <button
              type="submit" disabled={creating}
              style={{ marginTop: 14, width: '100%', padding: 11, background: creating ? C.muted : C.ink, color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
            >
              {creating ? 'Criando…' : 'Criar empresa'}
            </button>
          </form>
        </Card>

        {/* Códigos de acesso */}
        <Card>
          <SectionTitle>Códigos de acesso (/entrar)</SectionTitle>
          <p style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>
            A slug de cada empresa já funciona como código. Aqui entram os
            apelidos extras (ex: “ibr” e “ilhabelarepublic” levam ao IBR).
          </p>

          {codes.loading && !codes.data ? <Loading /> :
           codes.error && !codes.data ? <ErrorBox message={codes.error} onRetry={codes.refresh} /> : (
            <>
              <form onSubmit={addCode} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <input
                  style={{ ...input, flex: 1, minWidth: 130 }} value={newCode}
                  onChange={e => { setNewCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setCodeMsg(null); }}
                  placeholder="novo código"
                />
                <select
                  value={newCodeCompany}
                  onChange={e => { setNewCodeCompany(e.target.value); setCodeMsg(null); }}
                  style={{ ...input, width: 'auto', flex: 1, minWidth: 140 }}
                >
                  <option value="">empresa…</option>
                  {codes.data.companies.map(c => (
                    <option key={c.id} value={c.id}>{c.name || c.id}</option>
                  ))}
                </select>
                <button
                  type="submit" disabled={codeBusy}
                  style={{ background: C.ink, color: 'white', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  Adicionar
                </button>
              </form>
              {codeMsg && (
                <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: codeMsg.ok ? C.success : C.critical }}>
                  {codeMsg.message}
                </p>
              )}
              <Table
                head={['Código', 'Empresa', '']}
                empty="Nenhum código extra — as slugs já funcionam."
                rows={codes.data.codes.map(c => [
                  <strong key="c">{c.code}</strong>,
                  c.company_name,
                  <button key="x"
                    onClick={() => removeCode(c.code)} disabled={codeBusy}
                    style={{ background: 'none', border: `1px solid ${C.borderStrong}`, borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 700, color: C.critical, cursor: 'pointer' }}>
                    remover
                  </button>,
                ])}
              />
            </>
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <AdminsCard />
        <MyPasswordCard />
      </div>
    </div>
  );
}
