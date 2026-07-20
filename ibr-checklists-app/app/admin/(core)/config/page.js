'use client';
import { useState } from 'react';
import { C } from '../../../../lib/tokens';
import {
  useAdminData, Card, SectionTitle, UpdatedAt, ErrorBox, Loading, Empty, Table,
} from '../ui';

const input = {
  width: '100%', padding: '10px 12px', fontSize: 14,
  border: `1.5px solid ${C.borderStrong}`, borderRadius: 8,
  outline: 'none', color: C.ink, background: 'white',
};
const label = {
  display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: C.muted, margin: '12px 0 5px',
};

// Centro de ajustes: criar empresa pelo painel + códigos de acesso do /entrar.
export default function ConfigPage() {
  const codes = useAdminData('/api/admin/company-codes', 120000);

  // ── Criar empresa ─────────────────────────────────────────────────────────
  const [form, setForm] = useState({ name: '', slug: '', adminName: '', adminPin: '' });
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
        setForm({ name: '', slug: '', adminName: '', adminPin: '' });
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
        <h1 style={{ fontSize: 20, fontWeight: 800, color: C.ink }}>Config</h1>
        <UpdatedAt updatedAt={codes.updatedAt} onRefresh={codes.refresh} loading={codes.loading} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        {/* Criar empresa */}
        <Card>
          <SectionTitle>Criar empresa</SectionTitle>
          <p style={{ fontSize: 13, color: C.muted }}>
            Nasce com trial de 7 dias e gestor com o PIN abaixo. As lojas são
            configuradas pelo próprio gestor no onboarding guiado do app.
          </p>
          <form onSubmit={handleCreate}>
            <label style={label}>Nome da empresa</label>
            <input style={input} value={form.name} onChange={e => set('name', e.target.value)} placeholder="ex: Padaria Sol" />
            <label style={label}>Código / subdomínio (slug)</label>
            <input style={input} value={form.slug}
                   onChange={e => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                   placeholder="ex: padaria-sol" />
            <label style={label}>Nome do gestor</label>
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
    </div>
  );
}
