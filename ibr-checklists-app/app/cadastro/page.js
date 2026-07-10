'use client';

import { useState, useRef, useEffect } from 'react';
// Cliente anônimo, de propósito: quem se cadastra ainda não tem conta.
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/supabase';

const UNITS = [
  { id: 'ibr1', name: 'IBR1' },
  { id: 'ibr2', name: 'IBR2' },
  { id: 'ibr3', name: 'IBR3' },
];

const C = {
  ink: '#063C5C', bg: '#F7F9FB', border: '#E2EAF0',
  muted: '#6B8299', success: '#31C85A', critical: '#D1462F',
};

const inputStyle = {
  width: '100%', fontSize: 15, fontWeight: 600, color: '#063C5C',
  background: 'transparent', border: 'none', outline: 'none',
  padding: 0, boxSizing: 'border-box', fontFamily: 'inherit',
};

function formatCPF(v) {
  return v.replace(/\D/g,'').slice(0,11)
    .replace(/(\d{3})(\d)/,'$1.$2')
    .replace(/(\d{3})(\d)/,'$1.$2')
    .replace(/(\d{3})(\d{1,2})$/,'$1-$2');
}

function formatPhone(v) {
  return v.replace(/\D/g,'').slice(0,11)
    .replace(/(\d{2})(\d)/,'($1) $2')
    .replace(/(\d{5})(\d)/,'$1-$2');
}

async function notifyGestao(name, unitId) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/notify-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ name, unitId }),
    });
  } catch {}
}

export default function CadastroPage() {
  const [step, setStep] = useState(null); // null = loading, avoids SSR flash

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setStep(params.get('status') === '1' ? 'status' : 'form');
  }, []);
  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [unitId, setUnitId] = useState('ibr2');
  const [selfie, setSelfie] = useState(null);
  const [selfiePreview, setSelfiePreview] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const selfieRef = useRef(null);
  const turnstileRef = useRef(null);

  // Load Cloudflare Turnstile script
  useEffect(() => {
    if (document.querySelector('script[src*="turnstile"]')) return;
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
    script.onload = () => {
      if (window.turnstile && turnstileRef.current) {
        window.turnstile.render(turnstileRef.current, {
          sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '1x00000000000000000000AA', // test key
          callback: (token) => setCaptchaToken(token),
          'expired-callback': () => setCaptchaToken(''),
          theme: 'light',
        });
      }
    };
  }, []);

  const handleSelfie = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelfie(file);
    const reader = new FileReader();
    reader.onload = () => setSelfiePreview(reader.result);
    reader.readAsDataURL(file);
  };

  const validate = () => {
    if (!name.trim()) return 'Informe seu nome completo.';
    if (cpf.replace(/\D/g,'').length < 11) return 'CPF inválido — preencha os 11 dígitos.';
    if (phone.replace(/\D/g,'').length < 10) return 'Telefone inválido.';
    if (!email.includes('@')) return 'E-mail inválido.';
    if (!/^\d{4}$/.test(pin)) return 'O PIN deve ter exatamente 4 dígitos.';
    if (pin !== pinConfirm) return 'Os PINs não coincidem.';
    if (!selfie) return 'A selfie é obrigatória para confirmar sua identidade.';
    // captchaToken is optional — if Turnstile fails to load, allow submission
    return null;
  };

  const submit = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setError('');
    setLoading(true);
    try {
      const ext = selfie.name.split('.').pop() || 'jpg';
      // Nome aleatório: o CPF não pode viajar no path do objeto.
      const path = crypto.randomUUID() + '.' + ext;
      const { error: uploadErr } = await supabase.storage
        .from('colaboradores')
        .upload(path, selfie, { contentType: selfie.type, upsert: false });
      if (uploadErr) throw uploadErr;

      const { error: dbErr } = await supabase.from('user_requests').insert({
        name: name.trim(),
        pin,
        unit_id: unitId,
        cpf: cpf.replace(/\D/g,''),
        phone: phone.replace(/\D/g,''),
        email: email.trim().toLowerCase(),
        selfie_path: path,
        status: 'pendente',
      });
      if (dbErr) throw dbErr;

      await notifyGestao(name.trim(), unitId);
      setStep('success');
    } catch (e) {
      console.error(e);
      setError('Erro ao enviar. Verifique sua conexão e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const Divider = () => <div style={{ height: 1, background: C.border, margin: '0 0 20px' }} />;
  const Label = ({ children }) => (
    <p style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.muted, marginBottom: 6 }}>
      {children}
    </p>
  );

  if (step === null) return <div style={{ minHeight: '100vh', background: '#F7F9FB' }} />;

  if (step === 'status') {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui,sans-serif' }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: C.ink, textAlign: 'center', marginBottom: 4 }}>ZCheck</h1>
        <p style={{ fontSize: 13, color: C.muted, marginBottom: 28 }}>Verificar status de solicitação</p>
        <div style={{ width: '100%', maxWidth: 320 }}>
          <StatusChecker />
        </div>
        <a href="/app" style={{ marginTop: 24, fontSize: 12, fontWeight: 700, color: C.muted, textDecoration: 'none' }}>
          ← Voltar ao login
        </a>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui,sans-serif' }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: C.ink, textAlign: 'center', marginBottom: 8 }}>Solicitação enviada!</h1>
        <p style={{ fontSize: 14, color: C.muted, textAlign: 'center', maxWidth: 300, lineHeight: 1.6, marginBottom: 32 }}>
          Sua solicitação foi recebida. Sua solicitação será analisada em breve. Você será contatado via WhatsApp ou e-mail quando houver retorno.
        </p>
        <a href="/app" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 800, color: 'white', padding: '12px 28px', borderRadius: 10, background: C.ink, textDecoration: 'none' }}>
          Voltar ao início
        </a>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'system-ui,sans-serif', color: C.ink }}>
      {/* Header ZCheck */}
      <div style={{ width: '100%', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid rgba(6,60,92,0.08)', background: '#FFFFFF' }}>
        <img src="/zcheck-logo.png" alt="ZCheck" style={{ height: 40, width: 'auto', objectFit: 'contain' }} />
      </div>
      <div style={{ maxWidth: 420, margin: '0 auto', padding: '40px 20px 80px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <a href="/app" style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, color: C.muted, textDecoration: 'none', marginBottom: 16 }}>
            ← Voltar ao login
          </a>
          <p style={{ fontSize: 14, color: C.muted }}>Solicitar acesso ao app</p>
        </div>

        <div style={{ background: 'white', borderRadius: 12, padding: '20px 20px 4px', border: '1px solid ' + C.border, marginBottom: 16 }}>

          <div style={{ marginBottom: 20 }}>
            <Label>Nome completo</Label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Seu nome completo" style={inputStyle} />
          </div>
          <Divider />

          <div style={{ marginBottom: 20 }}>
            <Label>CPF</Label>
            <input value={cpf} onChange={e => setCpf(formatCPF(e.target.value))} placeholder="000.000.000-00" inputMode="numeric" style={inputStyle} />
          </div>
          <Divider />

          <div style={{ marginBottom: 20 }}>
            <Label>Telefone / WhatsApp</Label>
            <input value={phone} onChange={e => setPhone(formatPhone(e.target.value))} placeholder="(00) 00000-0000" inputMode="tel" style={inputStyle} />
          </div>
          <Divider />

          <div style={{ marginBottom: 20 }}>
            <Label>E-mail</Label>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" type="email" inputMode="email" style={inputStyle} />
          </div>
          <Divider />

          <div style={{ marginBottom: 20 }}>
            <Label>Loja</Label>
            <div style={{ display: 'flex', gap: 8 }}>
              {UNITS.map(u => (
                <button key={u.id} onClick={() => setUnitId(u.id)} style={{
                  flex: 1, padding: '10px 0', borderRadius: 8, fontWeight: 800, fontSize: 14, fontFamily: 'inherit',
                  border: '1.5px solid ' + (unitId === u.id ? C.ink : C.border),
                  background: unitId === u.id ? C.ink : 'white',
                  color: unitId === u.id ? 'white' : C.muted, cursor: 'pointer',
                }}>{u.name}</button>
              ))}
            </div>
          </div>
          <Divider />

          <div style={{ marginBottom: 20 }}>
            <Label>Crie seu PIN de acesso (4 dígitos)</Label>
            <input type="tel" inputMode="numeric" maxLength={4} value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g,'').slice(0,4))}
              placeholder="••••" style={{ ...inputStyle, fontSize: 24, letterSpacing: '0.5em', width: 120 }} />
          </div>
          <Divider />

          <div style={{ marginBottom: 20 }}>
            <Label>Confirme o PIN</Label>
            <input type="tel" inputMode="numeric" maxLength={4} value={pinConfirm}
              onChange={e => setPinConfirm(e.target.value.replace(/\D/g,'').slice(0,4))}
              placeholder="••••" style={{ ...inputStyle, fontSize: 24, letterSpacing: '0.5em', width: 120 }} />
          </div>
        </div>

        {/* Selfie */}
        <div style={{ background: 'white', borderRadius: 12, padding: 20, border: '1px solid ' + C.border, marginBottom: 16 }}>
          <p style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.muted, marginBottom: 12 }}>
            Foto selfie — obrigatória
          </p>
          <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.5, marginBottom: 16 }}>
            Tire uma selfie para confirmar sua identidade. Ela será analisada pela gestão na aprovação.
          </p>
          {selfiePreview ? (
            <div style={{ position: 'relative', marginBottom: 0 }}>
              <img src={selfiePreview} alt="Selfie" style={{ width: '100%', maxHeight: 280, objectFit: 'cover', borderRadius: 10, display: 'block' }} />
              <button onClick={() => { setSelfie(null); setSelfiePreview(null); }} style={{
                position: 'absolute', top: 8, right: 8, background: 'white',
                border: '1px solid ' + C.border, borderRadius: 20, padding: '4px 12px',
                fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
              }}>Refazer</button>
            </div>
          ) : (
            <button onClick={() => selfieRef.current?.click()} style={{
              width: '100%', padding: '24px 0', borderRadius: 10, border: '2px dashed ' + C.border,
              background: 'none', fontSize: 14, fontWeight: 800, color: C.ink, cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, fontFamily: 'inherit',
            }}>
              <span style={{ fontSize: 40 }}>📷</span>
              Tirar selfie
            </button>
          )}
          <input ref={selfieRef} type="file" accept="image/*" capture="user" onChange={handleSelfie} style={{ display: 'none' }} />
        </div>

        {/* Cloudflare Turnstile captcha */}
        <div ref={turnstileRef} style={{ marginBottom: 16 }} />

        {error && (
          <p style={{ fontSize: 13, fontWeight: 800, color: C.critical, marginBottom: 12, textAlign: 'center' }}>{error}</p>
        )}

        <button onClick={submit} disabled={loading} style={{
          width: '100%', padding: '16px 0', borderRadius: 12, border: 'none',
          background: loading ? C.muted : C.ink, color: 'white',
          fontSize: 16, fontWeight: 800, cursor: loading ? 'default' : 'pointer', fontFamily: 'inherit',
        }}>
          {loading ? 'Enviando…' : 'Solicitar acesso'}
        </button>

        <p style={{ fontSize: 12, color: C.muted, textAlign: 'center', marginTop: 16, lineHeight: 1.6 }}>
          Sua solicitação será analisada pela gestão antes de ser aprovada.
        </p>

        <p style={{ fontSize: 12, color: C.muted, textAlign: 'center', marginTop: 16, lineHeight: 1.8 }}>
          Ao solicitar acesso, você concorda com os{' '}
          <a href="/termos" target="_blank" style={{ color: C.ink, fontWeight: 700, textDecoration: 'underline' }}>
            Termos de Uso
          </a>
          {' '}e a{' '}
          <a href="/privacidade" target="_blank" style={{ color: C.ink, fontWeight: 700, textDecoration: 'underline' }}>
            Política de Privacidade
          </a>
          {' '}do ZCheck.
        </p>
      </div>
    </div>
  );
}

function StatusChecker({ cpf: initialCpf } = {}) {
  const [cpf, setCpf] = useState(initialCpf || '');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);

  const checkStatus = async () => {
    if (!cpf.trim()) return;
    setLoading(true);
    try {
      const raw = cpf.trim().replace(/\D/g, ''); // digits only: "12345678909"

      // `user_requests` não é mais legível pela chave anônima (o CPF e o caminho
      // da selfie estavam expostos). Este RPC devolve só o status, exigindo o
      // CPF completo. O RPC normaliza os dois formatos de armazenamento.
      const { data, error } = await supabase.rpc('user_request_status', { p_cpf: raw });
      if (error) throw error;

      setStatus(data?.[0]?.status ?? 'not_found');
      setChecked(true);
    } catch {
      setStatus('not_found');
      setChecked(true);
    }
    setLoading(false);
  };

  const statusInfo = {
    pendente:  { icon: '⏳', label: 'Solicitação em análise', color: '#C6842A', desc: 'Sua solicitação está sendo analisada. Por favor aguarde.' },
    aprovado:  { icon: '✅', label: 'Acesso aprovado!', color: '#31C85A', desc: 'Seu acesso foi aprovado. Abra o app e faça login com seu PIN.' },
    rejeitado: { icon: '❌', label: 'Solicitação não aprovada', color: '#D1462F', desc: 'Sua solicitação não foi aprovada. Entre em contato com a gestão.' },
    not_found: { icon: '🔍', label: 'Não encontrado', color: '#6B8299', desc: 'Nenhuma solicitação encontrada com esse CPF.' },
  };

  const info = status ? statusInfo[status] : null;

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={cpf}
          onChange={e => { setCpf(formatCPF(e.target.value)); setChecked(false); }}
          placeholder="Digite seu CPF"
          inputMode="numeric"
          onKeyDown={e => e.key === 'Enter' && checkStatus()}
          style={{ flex: 1, padding: '12px 12px', borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, fontWeight: 700, color: C.ink, background: 'white', outline: 'none' }}
        />
        <button
          onClick={checkStatus}
          disabled={loading || !cpf.trim()}
          style={{ padding: '12px 18px', borderRadius: 8, background: C.ink, color: 'white', fontWeight: 800, fontSize: 13, border: 'none', cursor: 'pointer', opacity: loading || !cpf.trim() ? 0.5 : 1 }}
        >
          {loading ? '...' : 'Consultar'}
        </button>
      </div>

      {checked && info && (
        <div style={{ marginTop: 14, padding: '16px', borderRadius: 10, background: 'white', border: `2px solid ${info.color}30`, textAlign: 'center' }}>
          <p style={{ fontSize: 30, marginBottom: 8 }}>{info.icon}</p>
          <p style={{ fontSize: 14, fontWeight: 800, color: info.color, marginBottom: 4 }}>{info.label}</p>
          <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>{info.desc}</p>
          {status === 'aprovado' && (
            <a href="/app" style={{ display: 'inline-block', marginTop: 14, padding: '10px 24px', background: '#31C85A', color: 'white', borderRadius: 8, fontWeight: 800, fontSize: 13, textDecoration: 'none' }}>
              Abrir o app →
            </a>
          )}
        </div>
      )}
    </div>
  );
}
