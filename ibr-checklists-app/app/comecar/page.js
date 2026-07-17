'use client';

import { useState, useEffect, useRef } from 'react';

import { C } from '../../lib/tokens';
// Cadastro self-service. Diferente de /onboarding (que exige a chave de
// provisionamento da equipe), aqui o acesso é público: e-mail OTP + Turnstile.
// O provisionamento em si continua no servidor (/api/signup/provision →
// provision_company), então nenhum segredo vaza para o bundle.

const uid = () => Math.random().toString(36).slice(2, 10);
const slug = (name) => name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

const SEGMENT_TEMPLATES = {
  restaurante: { units: ['Loja Principal'], sectors: ['Salão', 'Cozinha', 'Caixa'], types: ['Abertura', 'Intermediário', 'Fechamento'] },
  cafe:        { units: ['Unidade 1'], sectors: ['Salão', 'Bar', 'Caixa'], types: ['Abertura', 'Intermediário', 'Fechamento'] },
  hotel:       { units: ['Hotel'], sectors: ['Recepção', 'Governança', 'Manutenção', 'Alimentos & Bebidas'], types: ['Abertura', 'Intermediário', 'Fechamento', 'Vistoria'] },
  varejo:      { units: ['Loja 1'], sectors: ['Piso de Vendas', 'Estoque', 'Caixa'], types: ['Abertura', 'Conferência', 'Fechamento'] },
  padaria:     { units: ['Padaria'], sectors: ['Atendimento', 'Produção', 'Caixa'], types: ['Abertura', 'Produção Diária', 'Fechamento'] },
  personalizado: { units: [], sectors: [], types: [] },
};

const COLORS = ['#063C5C', '#1A6B4A', '#C6842A', '#0B3C5C', '#7B3FA0', '#B5451B', '#1E7A6E', '#8B4513', '#2C5F8A', '#6B4226'];

const STEPS = ['E-mail', 'Código', 'Empresa', 'Lojas', 'Setores', 'Tipos', 'Gestor'];

function Step({ n, label, active, done }) {
  return (
    <div className="flex flex-col items-center gap-1" style={{ flex: 1 }}>
      <div style={{
        width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 800, fontSize: 12,
        background: done ? C.success : active ? C.ink : C.border,
        color: done || active ? 'white' : C.muted, transition: 'all 0.2s',
      }}>
        {done ? '✓' : n}
      </div>
      <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: active ? C.ink : C.muted, textAlign: 'center' }}>{label}</span>
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

  // Empresa
  const [companyName, setCompanyName] = useState('');
  const [segment, setSegment] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#063C5C');
  const [units, setUnits] = useState([{ id: uid(), name: '', color: '#063C5C' }]);
  const [sectors, setSectors] = useState([]);
  const [types, setTypes] = useState([
    { id: uid(), name: 'Abertura' }, { id: uid(), name: 'Intermediário' }, { id: uid(), name: 'Fechamento' },
  ]);

  // Gestor
  const [gestorName, setGestorName] = useState('');
  const [gestorPin, setGestorPin] = useState('');
  const [gestorPin2, setGestorPin2] = useState('');
  const [createdSlug, setCreatedSlug] = useState('');

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

  const applyTemplate = (seg) => {
    setSegment(seg);
    const tpl = SEGMENT_TEMPLATES[seg];
    if (!tpl) return;
    if (tpl.units.length) setUnits(tpl.units.map(n => ({ id: uid(), name: n, color: primaryColor })));
    if (tpl.types.length) setTypes(tpl.types.map(n => ({ id: uid(), name: n })));
    if (tpl.sectors.length && tpl.units.length) setSectors(tpl.sectors.map(s => ({ id: uid(), name: s, unitId: null })));
  };

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
      if (!res.ok || !body?.ok) {
        setError(otpError(body?.reason));
      } else {
        setSignupId(body.signup_id);
        setStep(2);
      }
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
      if (!res.ok || !body?.ok) {
        setError(verifyError(body?.reason));
      } else {
        setClaimToken(body.claim_token);
        setStep(3);
      }
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

  // ── Navegação dos passos de configuração (3–7) ──
  const goNext = () => {
    setError('');
    if (step === 1) { requestOtp(); return; }
    if (step === 2) { verifyOtp(); return; }
    if (step === 3 && !companyName.trim()) { setError('Informe o nome da empresa.'); return; }
    if (step === 4 && units.some(u => !u.name.trim())) { setError('Preencha o nome de todas as lojas.'); return; }
    if (step === 7) { submit(); return; }
    setStep(s => s + 1);
    if (step === 4 && sectors.length === 0) {
      const tpl = SEGMENT_TEMPLATES[segment];
      if (tpl?.sectors.length) setSectors(tpl.sectors.map(s => ({ id: uid(), name: s, unitId: units[0]?.id || null })));
      else setSectors([{ id: uid(), name: '', unitId: units[0]?.id || null }]);
    }
  };

  // ── Passo 7: provisionar ──
  const submit = async () => {
    if (!gestorName.trim()) { setError('Informe o nome do gestor.'); return; }
    if (!/^\d{4}$/.test(gestorPin)) { setError('O PIN deve ter 4 dígitos.'); return; }
    if (gestorPin !== gestorPin2) { setError('Os PINs não coincidem.'); return; }

    setSaving(true); setError('');
    try {
      const companySlug = slug(companyName);
      if (companySlug.length < 3) { setError('O nome da empresa é muito curto.'); setSaving(false); return; }
      const companyId = companySlug + '-' + uid();
      const unitRows = units.filter(u => u.name.trim()).map((u, i) => ({ id: u.id, name: u.name.trim(), color: u.color, sort_order: i }));

      const res = await fetch('/api/signup/provision', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signup_id: signupId,
          claim_token: claimToken,
          company: { id: companyId, name: companyName.trim(), slug: companySlug, primary_color: primaryColor },
          units: unitRows,
          sectors: sectors.filter(s => s.name.trim()).map((s, i) => ({ id: s.id, unit_id: s.unitId || unitRows[0]?.id, name: s.name.trim(), sort_order: i })),
          checklist_types: types.filter(t => t.name.trim()).map((t, i) => ({ id: t.id, name: t.name.trim(), sort_order: i })),
          admin: { id: uid(), name: gestorName.trim(), pin: gestorPin },
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        setError(provisionError(res.status, body));
        setSaving(false);
        return;
      }
      setCreatedSlug(body.slug);
      setDone(true);
    } catch { setError('Erro ao criar empresa. Tente novamente.'); }
    setSaving(false);
  };

  const provisionError = (status, body) => {
    if (status === 409) return 'Este e-mail já criou uma empresa.';
    if (status === 403 || status === 410) return 'Sua sessão de cadastro expirou. Recomece pelo e-mail.';
    if (body?.message) return body.message; // mensagem de validação do RPC (ex.: slug em uso/reservado)
    return 'Erro ao criar empresa. Tente novamente.';
  };

  if (done) {
    const appUrl = `https://${createdSlug}.zcheckapp.com/app`;
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ fontSize: 64, marginBottom: 12 }}>🎉</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: C.ink, textAlign: 'center', marginBottom: 8 }}>Empresa criada!</h1>
        <p style={{ fontSize: 14, color: C.muted, textAlign: 'center', maxWidth: 340, lineHeight: 1.6, marginBottom: 20 }}>
          <strong>{companyName}</strong> está pronta. Entre com o nome <strong>{gestorName}</strong> e o PIN que você definiu.
        </p>
        <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 16px', marginBottom: 24, maxWidth: 360, width: '100%', textAlign: 'center' }}>
          <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, marginBottom: 4 }}>Endereço da sua empresa</p>
          <p style={{ fontSize: 14, fontWeight: 700, color: C.ink, wordBreak: 'break-all' }}>{createdSlug}.zcheckapp.com/app</p>
        </div>
        <a href={appUrl} style={{ padding: '14px 32px', borderRadius: 12, background: C.ink, color: 'white', fontWeight: 800, fontSize: 15, textDecoration: 'none' }}>
          Entrar no app →
        </a>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '32px 20px 100px' }}>

        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          {/* Mesmo logo da landing, em vez do wordmark "Zchek" escrito à mão. */}
          <img src="/zcheck-logo.png" alt="ZCheck" width={128} height={32}
            style={{ height: 32, width: 'auto', margin: '0 auto 8px' }} />
          <p style={{ fontSize: 13, color: C.muted }}>Crie sua empresa no ZCheck</p>
        </div>

        <div className="flex items-start justify-between" style={{ marginBottom: 28, gap: 2 }}>
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
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••••"
              style={{ width: '100%', fontSize: 28, fontWeight: 800, letterSpacing: '0.4em', color: C.ink, background: 'white', padding: '12px 14px', border: `1.5px solid ${C.border}`, borderRadius: 10, outline: 'none', textAlign: 'center' }} />
            <button onClick={() => { setStep(1); setCode(''); setError(''); }}
              style={{ background: 'none', border: 'none', color: C.ink, fontWeight: 700, fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>
              Não recebeu? Reenviar código
            </button>
          </div>
        )}

        {/* ── STEP 3: Empresa ── */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 style={{ fontSize: 20, fontWeight: 800, color: C.ink, marginBottom: 4 }}>Sobre sua empresa</h2>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>Essas informações identificam sua empresa no ZCheck.</p>
            <Input label="Nome da empresa" value={companyName} onChange={setCompanyName} placeholder="Ex: Padaria do João, Hotel Central..." />
            <div>
              <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, marginBottom: 8 }}>Segmento</p>
              <div className="flex flex-wrap gap-2">
                {Object.keys(SEGMENT_TEMPLATES).map(seg => (
                  <button key={seg} onClick={() => applyTemplate(seg)}
                    style={{ padding: '8px 16px', borderRadius: 20, fontWeight: 700, fontSize: 13, cursor: 'pointer',
                      background: segment === seg ? C.ink : 'white', color: segment === seg ? 'white' : C.muted,
                      border: `1.5px solid ${segment === seg ? C.ink : C.border}` }}>
                    {seg === 'personalizado' ? '+ Personalizado' : seg.charAt(0).toUpperCase() + seg.slice(1)}
                  </button>
                ))}
              </div>
              {segment && segment !== 'personalizado' && (
                <p style={{ fontSize: 11, color: C.success, marginTop: 8, fontWeight: 700 }}>✓ Estrutura de {segment} pré-carregada — ajuste nos próximos passos</p>
              )}
            </div>
            <div>
              <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, marginBottom: 8 }}>Cor principal</p>
              <div className="flex flex-wrap gap-2">
                {COLORS.map(c => (
                  <button key={c} onClick={() => setPrimaryColor(c)}
                    style={{ width: 36, height: 36, borderRadius: '50%', background: c, border: primaryColor === c ? `3px solid ${C.ink}` : '3px solid transparent', cursor: 'pointer', outline: primaryColor === c ? `2px solid white` : 'none', outlineOffset: -4 }} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 4: Lojas ── */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 style={{ fontSize: 20, fontWeight: 800, color: C.ink, marginBottom: 4 }}>Suas lojas / unidades</h2>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>Adicione cada loja ou unidade operacional.</p>
            <div className="space-y-3">
              {units.map((u, i) => (
                <div key={u.id} className="flex items-center gap-2">
                  <input type="color" value={u.color} onChange={e => setUnits(prev => prev.map(x => x.id === u.id ? { ...x, color: e.target.value } : x))}
                    style={{ width: 42, height: 42, borderRadius: 8, border: `1.5px solid ${C.border}`, cursor: 'pointer', padding: 2, flexShrink: 0 }} />
                  <input value={u.name} onChange={e => setUnits(prev => prev.map(x => x.id === u.id ? { ...x, name: e.target.value } : x))} placeholder={`Loja ${i + 1}`}
                    style={{ flex: 1, fontSize: 14, fontWeight: 600, color: C.ink, background: 'white', padding: '12px 14px', border: `1.5px solid ${C.border}`, borderRadius: 10, outline: 'none', fontFamily: 'inherit' }} />
                  {units.length > 1 && (
                    <button onClick={() => setUnits(prev => prev.filter(x => x.id !== u.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 18, padding: '0 4px' }}>×</button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={() => setUnits(prev => [...prev, { id: uid(), name: '', color: primaryColor }])}
              style={{ width: '100%', padding: '12px', borderRadius: 10, border: `2px dashed ${C.border}`, fontWeight: 700, color: C.muted, background: 'none', cursor: 'pointer', fontSize: 14 }}>+ Adicionar loja</button>
          </div>
        )}

        {/* ── STEP 5: Setores ── */}
        {step === 5 && (
          <div className="space-y-4">
            <h2 style={{ fontSize: 20, fontWeight: 800, color: C.ink, marginBottom: 4 }}>Setores operacionais</h2>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>Defina os setores de cada loja (ex: Salão, Cozinha, Caixa).</p>
            <div className="space-y-3">
              {sectors.map((s, i) => (
                <div key={s.id} className="flex items-center gap-2">
                  {units.length > 1 && (
                    <select value={s.unitId || ''} onChange={e => setSectors(prev => prev.map(x => x.id === s.id ? { ...x, unitId: e.target.value } : x))}
                      style={{ fontSize: 12, fontWeight: 700, color: C.ink, background: 'white', padding: '12px 8px', border: `1.5px solid ${C.border}`, borderRadius: 8, outline: 'none', flexShrink: 0 }}>
                      <option value="">Loja?</option>
                      {units.map(u => <option key={u.id} value={u.id}>{u.name || `Loja ${units.indexOf(u)+1}`}</option>)}
                    </select>
                  )}
                  <input value={s.name} onChange={e => setSectors(prev => prev.map(x => x.id === s.id ? { ...x, name: e.target.value } : x))} placeholder={`Setor ${i + 1}`}
                    style={{ flex: 1, fontSize: 14, fontWeight: 600, color: C.ink, background: 'white', padding: '12px 14px', border: `1.5px solid ${C.border}`, borderRadius: 10, outline: 'none', fontFamily: 'inherit' }} />
                  {sectors.length > 1 && (
                    <button onClick={() => setSectors(prev => prev.filter(x => x.id !== s.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 18, padding: '0 4px' }}>×</button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={() => setSectors(prev => [...prev, { id: uid(), name: '', unitId: units[0]?.id || null }])}
              style={{ width: '100%', padding: '12px', borderRadius: 10, border: `2px dashed ${C.border}`, fontWeight: 700, color: C.muted, background: 'none', cursor: 'pointer', fontSize: 14 }}>+ Adicionar setor</button>
          </div>
        )}

        {/* ── STEP 6: Tipos ── */}
        {step === 6 && (
          <div className="space-y-4">
            <h2 style={{ fontSize: 20, fontWeight: 800, color: C.ink, marginBottom: 4 }}>Tipos de checklist</h2>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>Defina os tipos de checklist da sua operação. Adicione qualquer tipo que faça sentido para seu negócio.</p>
            <div className="space-y-3">
              {types.map((t, i) => (
                <div key={t.id} className="flex items-center gap-2">
                  <input value={t.name} onChange={e => setTypes(prev => prev.map(x => x.id === t.id ? { ...x, name: e.target.value } : x))} placeholder={`Tipo ${i + 1}`}
                    style={{ flex: 1, fontSize: 14, fontWeight: 600, color: C.ink, background: 'white', padding: '12px 14px', border: `1.5px solid ${C.border}`, borderRadius: 10, outline: 'none', fontFamily: 'inherit' }} />
                  {types.length > 1 && (
                    <button onClick={() => setTypes(prev => prev.filter(x => x.id !== t.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 18, padding: '0 4px' }}>×</button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={() => setTypes(prev => [...prev, { id: uid(), name: '' }])}
              style={{ width: '100%', padding: '12px', borderRadius: 10, border: `2px dashed ${C.border}`, fontWeight: 700, color: C.muted, background: 'none', cursor: 'pointer', fontSize: 14 }}>+ Adicionar tipo</button>
          </div>
        )}

        {/* ── STEP 7: Gestor ── */}
        {step === 7 && (
          <div className="space-y-4">
            <h2 style={{ fontSize: 20, fontWeight: 800, color: C.ink, marginBottom: 4 }}>Conta do gestor</h2>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>Crie a conta principal de acesso à plataforma.</p>
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
            <div style={{ background: 'white', borderRadius: 12, padding: 16, border: `1px solid ${C.border}` }}>
              <p style={{ fontSize: 12, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Resumo da configuração</p>
              <div className="space-y-2">
                <div className="flex justify-between"><span style={{ fontSize: 13, color: C.muted }}>Empresa</span><span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{companyName}</span></div>
                <div className="flex justify-between"><span style={{ fontSize: 13, color: C.muted }}>Lojas</span><span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{units.filter(u => u.name.trim()).length}</span></div>
                <div className="flex justify-between"><span style={{ fontSize: 13, color: C.muted }}>Setores</span><span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{sectors.filter(s => s.name.trim()).length}</span></div>
                <div className="flex justify-between"><span style={{ fontSize: 13, color: C.muted }}>Tipos de checklist</span><span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{types.filter(t => t.name.trim()).length}</span></div>
              </div>
            </div>
          </div>
        )}

        {error && (
          <p style={{ fontSize: 13, fontWeight: 700, color: C.critical, marginTop: 16, textAlign: 'center' }}>{error}</p>
        )}

        <div className="flex gap-3" style={{ marginTop: 32 }}>
          {step > 3 && (
            <button onClick={() => { setError(''); setStep(s => s - 1); }}
              style={{ flex: 1, padding: '14px', borderRadius: 12, border: `1.5px solid ${C.border}`, fontWeight: 800, color: C.ink, background: 'white', cursor: 'pointer', fontSize: 15 }}>← Voltar</button>
          )}
          <button onClick={goNext} disabled={saving}
            style={{ flex: 2, padding: '14px', borderRadius: 12, border: 'none', fontWeight: 800, color: 'white', background: saving ? C.muted : C.ink, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 15 }}>
            {saving ? 'Aguarde...' : step === 1 ? 'Enviar código →' : step === 2 ? 'Verificar →' : step === 7 ? 'Criar empresa →' : 'Próximo →'}
          </button>
        </div>

        <p style={{ fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 24 }}>
          Já tem uma conta? <a href="/entrar" style={{ color: C.ink, fontWeight: 700 }}>Acessar</a>
        </p>
      </div>
    </div>
  );
}
