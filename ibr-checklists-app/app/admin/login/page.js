'use client';
import { useState } from 'react';
import { C, R, W, T } from '../../../lib/tokens';

// Login do ZCheck Core — exclusivo do super-admin da plataforma (cross-tenant).
// Credencial: email+senha no Supabase Auth, validada em /api/admin/login, que
// só emite sessão para quem está em `platform_admins`.
export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim() || !password) { setErro('Preencha e-mail e senha.'); return; }
    setErro(''); setLoading(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        window.location.href = '/admin';
        return;
      }
      setErro(
        data.reason === 'rate_limited'
          ? 'Muitas tentativas. Aguarde um pouco e tente de novo.'
          : 'E-mail ou senha incorretos.'
      );
    } catch {
      setErro('Não foi possível entrar agora. Tente novamente.');
    }
    setLoading(false);
  }

  const input = {
    width: '100%', padding: '12px 14px', fontSize: T?.body || 15,
    border: `1.5px solid ${C.borderStrong}`, borderRadius: R?.sm || 10,
    outline: 'none', color: C.ink, background: 'white', marginBottom: 14,
  };
  const label = {
    display: 'block', fontSize: 11, fontWeight: W?.bold || 800,
    letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, marginBottom: 6,
  };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', flexDirection: 'column', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <header style={{ background: 'white', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: `1px solid ${C.border}` }}>
        <img src="/zcheck-logo.png" alt="ZCheck" style={{ height: 32, width: 'auto' }} />
      </header>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: C.ink, marginBottom: 6 }}>ZCheck Core</h1>
            <p style={{ fontSize: 14, color: C.muted }}>Centro de inteligência e gestão da plataforma</p>
          </div>

          <form onSubmit={handleSubmit} style={{ background: 'white', borderRadius: 16, border: `1px solid ${C.border}`, padding: 28, boxShadow: '0 8px 24px rgba(6,60,92,0.06)' }}>
            <label style={label}>E-mail</label>
            <input
              type="email" value={email} autoComplete="username" autoFocus
              onChange={e => { setEmail(e.target.value); setErro(''); }}
              style={input}
            />
            <label style={label}>Senha</label>
            <input
              type="password" value={password} autoComplete="current-password"
              onChange={e => { setPassword(e.target.value); setErro(''); }}
              style={{ ...input, marginBottom: erro ? 8 : 20 }}
            />
            {erro && <p role="alert" style={{ fontSize: 13, color: C.critical, marginBottom: 14 }}>{erro}</p>}
            <button
              type="submit" disabled={loading}
              style={{ width: '100%', padding: 13, background: loading ? C.muted : C.ink, color: 'white', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              {loading ? 'Entrando...' : 'Entrar no Core →'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 22, fontSize: 12, color: C.mutedLight }}>
            Acesso restrito à equipe ZCheck.
          </p>
        </div>
      </div>
    </div>
  );
}
