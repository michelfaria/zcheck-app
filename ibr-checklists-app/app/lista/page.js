'use client';

import { useState } from 'react';
// Cliente anônimo de propósito: quem entra na lista ainda não tem conta.
// A tabela `waitlist` aceita só INSERT do anon — ninguém lê os leads pelo app.
import { supabase } from '../../lib/supabase';
import { C, R, W, T } from '../../lib/tokens';
import { LIBRARY_VERTICALS } from '../../lib/library';

const STORE_RANGES = ['1', '2–5', '6+'];

const box = {
  width: '100%', fontSize: T.body, color: C.ink, background: 'white',
  padding: '13px 14px', border: `1.5px solid ${C.border}`, borderRadius: R.sm,
  outline: 'none', fontFamily: 'inherit',
};

const Label = ({ children }) => (
  <p style={{ fontSize: T.label, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted, marginBottom: 6 }}>
    {children}
  </p>
);

export default function ListaPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [sector, setSector] = useState('');
  const [stores, setStores] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  // 'done' = entrou agora · 'already' = e-mail já estava na lista (também é sucesso)
  const [state, setState] = useState(null);

  const submit = async e => {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Informe seu nome.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Informe um e-mail válido.'); return; }
    if (!company.trim()) { setError('Informe o nome da empresa.'); return; }
    if (!sector) { setError('Escolha o setor — é o que nos diz quais modelos preparar para você.'); return; }

    setSending(true);
    try {
      const { error: dbErr } = await supabase.from('waitlist').insert({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        company: company.trim(),
        sector,
        stores: stores || null,
        whatsapp: whatsapp.trim() || null,
        source: 'landing',
      });

      if (!dbErr) { setState('done'); return; }
      if (dbErr.code === '23505') { setState('already'); return; }
      console.warn('waitlist insert failed', dbErr);
      setError('Não foi possível enviar agora. Tente de novo — ou fale conosco no WhatsApp do rodapé da página inicial.');
    } finally {
      // Nunca deixar o botão preso em "Enviando…", mesmo num throw inesperado.
      setSending(false);
    }
  };

  if (state) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'Inter', system-ui, sans-serif", textAlign: 'center' }}>
        <p style={{ fontSize: 56, marginBottom: 12 }} aria-hidden>{state === 'done' ? '✅' : '👋'}</p>
        <h1 style={{ fontSize: T.h2, fontWeight: W.bold, color: C.ink, marginBottom: 10 }}>
          {state === 'done' ? 'Você está na lista!' : 'Você já está na lista'}
        </h1>
        <p style={{ fontSize: T.bodySm, color: C.muted, maxWidth: 340, lineHeight: 1.7, marginBottom: 28 }}>
          {state === 'done'
            ? 'Retornamos em até 2 dias úteis para configurar sua operação com você. Sem cartão, sem compromisso.'
            : 'Este e-mail já tinha entrado antes — está tudo certo. Retornamos em até 2 dias úteis.'}
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <a href="/" style={{ fontSize: T.bodySm, fontWeight: W.semibold, color: C.ink, textDecoration: 'none', border: `1.5px solid ${C.border}`, borderRadius: R.sm, padding: '11px 24px', background: 'white' }}>
            ← Voltar ao início
          </a>
          {/* Caminho ativo enquanto a resposta não chega — e cobre o buraco
              operacional de a lista ser lida manualmente no SQL Editor. */}
          <a href="https://wa.me/5512988017472?text=Ol%C3%A1%2C%20acabei%20de%20entrar%20na%20lista%20do%20ZCheck!"
            style={{ fontSize: T.bodySm, fontWeight: W.semibold, color: 'white', textDecoration: 'none', borderRadius: R.sm, padding: '11px 24px', background: C.success }}>
            Acelerar pelo WhatsApp
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 440, margin: '0 auto', padding: '40px 20px 80px' }}>
        <a href="/" style={{ fontSize: T.caption, fontWeight: W.semibold, color: C.muted, textDecoration: 'none' }}>← Voltar ao início</a>

        <h1 style={{ fontSize: T.h1, fontWeight: W.bold, color: C.ink, marginTop: 20, marginBottom: 8 }}>
          Entrar na lista de acesso
        </h1>
        <p style={{ fontSize: T.bodySm, color: C.muted, lineHeight: 1.65, marginBottom: 28 }}>
          Configuramos sua operação manualmente, uma empresa por vez.
          Sem cartão, sem compromisso — retorno em até 2 dias úteis.
        </p>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <Label>Nome</Label>
            <input style={box} value={name} onChange={e => setName(e.target.value)} autoComplete="name" placeholder="Seu nome" />
          </div>
          <div>
            <Label>E-mail</Label>
            <input style={box} type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" inputMode="email" placeholder="voce@empresa.com" />
          </div>
          <div>
            <Label>Empresa</Label>
            <input style={box} value={company} onChange={e => setCompany(e.target.value)} autoComplete="organization" placeholder="Nome do negócio" />
          </div>
          <div>
            <Label>Setor</Label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {[...LIBRARY_VERTICALS.map(v => v.label), 'Outro'].map(s => (
                <button type="button" key={s} onClick={() => setSector(s)}
                  style={{ fontSize: T.bodySm, fontWeight: W.semibold, padding: '9px 16px', borderRadius: R.pill, cursor: 'pointer',
                    background: sector === s ? C.ink : 'white', color: sector === s ? 'white' : C.muted,
                    border: `1.5px solid ${sector === s ? C.ink : C.border}` }}>
                  {s}
                </button>
              ))}
            </div>
            <p style={{ fontSize: T.label, color: C.muted, marginTop: 6 }}>É o que nos diz quais modelos de checklist preparar para você.</p>
          </div>
          <div>
            <Label>Quantas lojas / unidades? <span style={{ textTransform: 'none', letterSpacing: 0 }}>(opcional)</span></Label>
            <div style={{ display: 'flex', gap: 8 }}>
              {STORE_RANGES.map(r => (
                <button type="button" key={r} onClick={() => setStores(stores === r ? '' : r)}
                  style={{ flex: 1, fontSize: T.bodySm, fontWeight: W.semibold, padding: '10px 0', borderRadius: R.sm, cursor: 'pointer',
                    background: stores === r ? C.ink : 'white', color: stores === r ? 'white' : C.muted,
                    border: `1.5px solid ${stores === r ? C.ink : C.border}` }}>
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>WhatsApp <span style={{ textTransform: 'none', letterSpacing: 0 }}>(opcional)</span></Label>
            <input style={box} value={whatsapp} onChange={e => setWhatsapp(e.target.value)} autoComplete="tel" inputMode="tel" placeholder="(00) 00000-0000" />
          </div>

          {error && <p role="alert" style={{ fontSize: T.caption, fontWeight: W.semibold, color: C.critical }}>{error}</p>}

          <button type="submit" disabled={sending}
            style={{ padding: 15, borderRadius: R.md, border: 'none', fontWeight: W.semibold, fontSize: T.body,
              color: 'white', background: sending ? C.muted : C.ink, cursor: sending ? 'wait' : 'pointer' }}>
            {sending ? 'Enviando…' : 'Entrar na lista'}
          </button>
          <p style={{ fontSize: T.label, color: C.muted, textAlign: 'center', lineHeight: 1.6 }}>
            Usamos esses dados só para o contato de ativação, conforme a{' '}
            <a href="/privacidade" style={{ color: C.muted }}>Política de Privacidade</a>.
          </p>
        </form>
      </div>
    </div>
  );
}
