'use client';

import { useState, useEffect, useRef } from 'react';

import { C } from '../../lib/tokens';
// Cadastro self-service ENXUTO. Só o mínimo para criar a conta: e-mail (OTP) →
// nome da empresa → gestor (nome + PIN). Toda a configuração da operação (lojas,
// setores, checklists, logo, cores) acontece DEPOIS, no onboarding guiado dentro
// do app, onde o gestor vê o resultado enquanto configura. O provisionamento
// segue no servidor (/api/signup/provision → provision_company).

const uid = () => Math.random().toString(36).slice(2, 10);
const slug = (name) => name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

const STEPS = ['E-mail', 'Código', 'Empresa', 'Gestor'];

function Step({ n, label, active, done }) {
  return (
    <div className="flex flex-col items-center gap-1" style={{ flex: 1, minWidth: 0 }}>
      <div style={{
        width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        fontWeight: 800, fontSize: 12,
        background: done ? C.success : active ? C.ink : C.border,
        color: done || active ? 'white' : C.muted, transition: 'all 0.2s',
      }}>
        {done ? '✓' : n}
      </div>
      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: active ? C.ink : C.muted, textAlign: 'center' }}>{label}</span>
    </div>
  );
}

function Input({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div>
      {label && <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, marginBottom: 6 }}>{label}</p>}
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', fontSize: 14, fontWeight: 600, color: C.ink, background: 'white', padding: '12px 14px',
          border: `1.5px solid ${C.border}`, borderRadius: 10, outline: 'none', fontFamily: 'inherit' }} />
    </div>
  );
}

export default function ComecarPage() {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  // Verificação de e-mail
  const [email, setEmail] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [signupId, setSignupId] = useState('');
  const [claimToken, setClaimToken] = useState('');
  const [code, setCode] = useState('');
  const turnstileRef = useRef(null);
  const turnstileRendered = useRef(false);

  // Empresa (só o nome — o resto é no onboarding)
  const [companyName, setCompanyName] = useState('');
  const [createdSlug, setCreatedSlug] = useState('');
  const [copied, setCopied] = useState(false);

  // Gestor
  const [gestorName, setGestorName] = useState('');
  const [gestorPin, setGestorPin] = useState('');
  const [gestorPin2, setGestorPin2] = useState('');

  // Turnstile: carrega o script uma vez.
  useEffect(() => {
    if (document.querySelector('script[src*="turnstile"]')) return;
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true; script.defer = true;
    document.head.appendChild(script);
  }, []);

  // Renderiza o widget quando o passo do e-mail está visível.
  useEffect(() => {
    if (step !== 1 || turnstileRendered.current) return;
    const tryRender = () => {
      if (window.turnstile && turnstileRef.current) {
        window.turnstile.render(turnstileRef.current, {
          sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '1x00000000000000000000AA',
          callback: (token) => setCaptchaToken(token),
          'expired-callback': () => setCaptchaToken(''),
          theme: 'light',
        });
        turnstileRendered.current = true;
        return true;
      }
      return false;
    };
    if (!tryRender()) {
      const t = setInterval(() => { if (tryRender()) clearInterval(t); }, 300);
      return () => clearInterval(t);
    }
  }, [step]);

  // ── Passo 1: pedir OTP ──
  const requestOtp = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Informe um e-mail válido.'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/signup/request-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), turnstileToken: captchaToken }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) setError(otpError(body?.reason));
      else { setSignupId(body.signup_id); setStep(2); }
    } catch { setError('Erro de conexão. Tente novamente.'); }
    setSaving(false);
  };

  // ── Passo 2: verificar OTP ──
  const verifyOtp = async () => {
    if (!/^\d{6}$/.test(code)) { setError('O código tem 6 dígitos.'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/signup/verify-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signup_id: signupId, code }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) setError(verifyError(body?.reason));
      else { setClaimToken(body.claim_token); setStep(3); }
    } catch { setError('Erro de conexão. Tente novamente.'); }
    setSaving(false);
  };

  const otpError = (reason) => ({
    invalid_email: 'E-mail inválido.',
    captcha_failed: 'Falha na verificação anti-robô. Recarregue e tente de novo.',
    rate_limited: 'Muitas tentativas. Aguarde alguns minutos.',
    send_failed: 'Não conseguimos enviar o e-mail agora. Tente novamente.',
    server_misconfigured: 'Serviço de cadastro indisponível no momento.',
  }[reason] || 'Não foi possível enviar o código. Tente novamente.');

  const verifyError = (reason) => ({
    wrong_code: 'Código incorreto. Confira o e-mail.',
    expired: 'O código expirou. Peça um novo.',
    rate_limited: 'Muitas tentativas. Peça um novo código.',
    not_found: 'Sessão de cadastro não encontrada. Recomece.',
    already_used: 'Este cadastro já foi usado. Recomece.',
  }[reason] || 'Não foi possível validar o código. Tente novamente.');

  const goNext = () => {
    setError('');
    if (step === 1) { requestOtp(); return; }
    if (step === 2) { verifyOtp(); return; }
    if (step === 3) {
      if (!companyName.trim()) { setError('Informe o nome da empresa.'); return; }
      if (slug(companyName).length < 3) { setError('O nome da empresa é muito curto.'); return; }
      setStep(4); return;
    }
    if (step === 4) { submit(); return; }
  };

  // ── Passo 4: provisionar (só empresa + gestor; config vai no onboarding) ──
  const submit = async () => {
    if (!gestorName.trim()) { setError('Informe o nome do gestor.'); return; }
    if (!/^\d{4}$/.test(gestorPin)) { setError('O PIN deve ter 4 dígitos.'); return; }
    if (gestorPin !== gestorPin2) { setError('Os PINs não coincidem.'); return; }

    setSaving(true); setError('');
    try {
      const companySlug = slug(companyName);
      const companyId = companySlug + '-' + uid();
      const res = await fetch('/api/signup/provision', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signup_id: signupId,
          claim_token: claimToken,
          company: { id: companyId, name: companyName.trim(), slug: companySlug },
          admin: { id: uid(), name: gestorName.trim(), pin: gestorPin },
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) { setError(provisionError(res.status, body)); setSaving(false); return; }
      setCreatedSlug(body.slug);
      setDone(true);
    } catch { setError('Erro ao criar empresa. Tente novamente.'); }
    setSaving(false);
  };

  const provisionError = (status, body) => {
    if (status === 409) return 'Este e-mail já criou uma empresa.';
    if (status === 403 || status === 410) return 'Sua sessão de cadastro expirou. Recomece pelo e-mail.';
    if (body?.message) return body.message;
    return 'Erro ao criar empresa. Tente novamente.';
  };

  if (done) {
    const appUrl = `https://${createdSlug}.zcheckapp.com/app`;
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ fontSize: 64, marginBottom: 12 }}>🎉</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: C.ink, textAlign: 'center', marginBottom: 8 }}>Conta criada!</h1>
        <p style={{ fontSize: 14, color: C.muted, textAlign: 'center', maxWidth: 360, lineHeight: 1.6, marginBottom: 20 }}>
          Entre com o nome <strong>{gestorName}</strong> e o PIN que você definiu. No primeiro acesso você configura
          sua operação — lojas, checklists, logo e cores — em poucos passos.
        </p>
        <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 16px', marginBottom: 24, maxWidth: 360, width: '100%', textAlign: 'center' }}>
          <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, marginBottom: 6 }}>Endereço da sua empresa</p>
          <p style={{ fontSize: 14, fontWeight: 700, color: C.ink, wordBreak: 'break-all', marginBottom: 10 }}>{createdSlug}.zcheckapp.com/app</p>
          <button
            onClick={async () => {
              try { await navigator.clipboard.writeText(appUrl); } catch (_) {}
              setCopied(true); setTimeout(() => setCopied(false), 2000);
            }}
            style={{ width: '100%', padding: '9px', borderRadius: 8, border: `1.5px solid ${C.border}`, background: copied ? '#F0FAF4' : 'white', color: copied ? C.success : C.ink, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            {copied ? '✓ Link copiado' : 'Copiar link'}
          </button>
        </div>
        <a href={appUrl} style={{ padding: '14px 32px', borderRadius: 12, background: C.ink, color: 'white', fontWeight: 800, fontSize: 15, textDecoration: 'none' }}>
          Entrar e configurar →
        </a>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'system-ui, sans-serif', overflowX: 'hidden' }}>
      <div style={{ maxWidth: 460, margin: '0 auto', padding: '32px 20px 100px', width: '100%' }}>

        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img src="/zcheck-logo.png" alt="ZCheck" width={128} height={32}
            style={{ height: 32, width: 'auto', margin: '0 auto 8px' }} />
          <p style={{ fontSize: 13, color: C.muted }}>Crie sua conta no ZCheck</p>
        </div>

        <div className="flex items-start justify-between" style={{ marginBottom: 28, gap: 6 }}>
          {STEPS.map((label, i) => (
            <Step key={i} n={i + 1} label={label} active={step === i + 1} done={step > i + 1} />
          ))}
        </div>

        {/* ── STEP 1: E-mail ── */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 style={{ fontSize: 20, fontWeight: 800, color: C.ink, marginBottom: 4 }}>Seu e-mail</h2>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>Enviaremos um código de 6 dígitos para confirmar que é você.</p>
            <Input label="E-mail" value={email} onChange={setEmail} placeholder="voce@empresa.com" type="email" />
            <div ref={turnstileRef} style={{ marginTop: 8 }} />
          </div>
        )}

        {/* ── STEP 2: Código ── */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 style={{ fontSize: 20, fontWeight: 800, color: C.ink, marginBottom: 4 }}>Digite o código</h2>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>Enviamos um código de 6 dígitos para <strong>{email}</strong>.</p>
            <input type="tel" inputMode="numeric" maxLength={6} value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="••••••"
              style={{ width: '100%', fontSize: 28, fontWeight: 800, letterSpacing: '0.4em', color: C.ink, background: 'white', padding: '12px 14px', border: `1.5px solid ${C.border}`, borderRadius: 10, outline: 'none', textAlign: 'center' }} />
            <button onClick={() => { setStep(1); setCode(''); setError(''); }}
              style={{ background: 'none', border: 'none', color: C.ink, fontWeight: 700, fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>
              Não recebeu? Reenviar código
            </button>
          </div>
        )}

        {/* ── STEP 3: Empresa (só o nome) ── */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 style={{ fontSize: 20, fontWeight: 800, color: C.ink, marginBottom: 4 }}>Nome da empresa</h2>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>É como sua empresa aparece no ZCheck. As lojas e checklists você configura no primeiro acesso.</p>
            <Input label="Nome da empresa" value={companyName} onChange={setCompanyName} placeholder="Ex: Padaria do João, Hotel Central..." />
            {companyName.trim() && slug(companyName).length >= 3 && (
              <p style={{ fontSize: 12, color: C.muted }}>Seu endereço: <strong style={{ color: C.ink }}>{slug(companyName)}.zcheckapp.com</strong></p>
            )}
          </div>
        )}

        {/* ── STEP 4: Gestor ── */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 style={{ fontSize: 20, fontWeight: 800, color: C.ink, marginBottom: 4 }}>Conta do gestor</h2>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>A conta principal de acesso. Você entra com o nome e o PIN.</p>
            <Input label="Nome do gestor" value={gestorName} onChange={setGestorName} placeholder="Ex: João Silva" />
            <div>
              <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, marginBottom: 6 }}>PIN de acesso (4 dígitos)</p>
              <input type="tel" inputMode="numeric" maxLength={4} value={gestorPin}
                onChange={e => setGestorPin(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="••••"
                style={{ width: '100%', fontSize: 24, fontWeight: 800, letterSpacing: '0.5em', color: C.ink, background: 'white', padding: '12px 14px', border: `1.5px solid ${C.border}`, borderRadius: 10, outline: 'none', textAlign: 'center' }} />
            </div>
            <div>
              <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, marginBottom: 6 }}>Confirmar PIN</p>
              <input type="tel" inputMode="numeric" maxLength={4} value={gestorPin2}
                onChange={e => setGestorPin2(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="••••"
                style={{ width: '100%', fontSize: 24, fontWeight: 800, letterSpacing: '0.5em', color: C.ink, background: 'white', padding: '12px 14px', border: `1.5px solid ${gestorPin2 && gestorPin !== gestorPin2 ? C.critical : C.border}`, borderRadius: 10, outline: 'none', textAlign: 'center' }} />
              {gestorPin2 && gestorPin !== gestorPin2 && (
                <p style={{ fontSize: 11, color: C.critical, fontWeight: 700, marginTop: 4 }}>PINs não coincidem</p>
              )}
            </div>
          </div>
        )}

        {error && (
          <p style={{ fontSize: 13, fontWeight: 700, color: C.critical, marginTop: 16, textAlign: 'center' }}>{error}</p>
        )}

        <div className="flex gap-3" style={{ marginTop: 32 }}>
          {step === 4 && (
            <button onClick={() => { setError(''); setStep(3); }}
              style={{ flex: 1, padding: '14px', borderRadius: 12, border: `1.5px solid ${C.border}`, fontWeight: 800, color: C.ink, background: 'white', cursor: 'pointer', fontSize: 15 }}>← Voltar</button>
          )}
          <button onClick={goNext} disabled={saving}
            style={{ flex: 2, padding: '14px', borderRadius: 12, border: 'none', fontWeight: 800, color: 'white', background: saving ? C.muted : C.ink, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 15 }}>
            {saving ? 'Aguarde...' : step === 1 ? 'Enviar código →' : step === 2 ? 'Verificar →' : step === 4 ? 'Criar conta →' : 'Próximo →'}
          </button>
        </div>

        <p style={{ fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 24 }}>
          Já tem uma conta? <a href="/entrar" style={{ color: C.ink, fontWeight: 700 }}>Acessar</a>
        </p>
      </div>
    </div>
  );
}
