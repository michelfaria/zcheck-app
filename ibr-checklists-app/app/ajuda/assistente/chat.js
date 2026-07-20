'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { C } from '../../../lib/tokens';
import { track } from '../../../lib/track';
import { Breadcrumb } from '../article-ui';

const SUGGESTIONS = [
  'Como instalar o app no celular?',
  'Esqueci meu PIN, e agora?',
  'Como criar um novo checklist?',
  'O app funciona sem internet?',
];

const WELCOME = {
  role: 'assistant',
  content: 'Olá! Sou o assistente do ZCheck. Posso ajudar com dúvidas sobre acesso, checklists, fotos, relatórios e muito mais. O que você precisa?',
};

export function Chat() {
  const [messages, setMessages] = useState([WELCOME]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  const send = async text => {
    const content = text.trim();
    if (!content || sending) return;
    setError('');
    const next = [...messages, { role: 'user', content }];
    setMessages(next);
    setInput('');
    setSending(true);
    try {
      track('help_assistant_message', { source: 'ajuda', metadata: { chars: content.length } });
    } catch {}
    try {
      // A mensagem de boas-vindas é da UI, não da conversa — não vai à API.
      const payload = next.filter(m => m !== WELCOME).map(({ role, content }) => ({ role, content }));
      const res = await fetch('/api/ajuda/assistente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: payload }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok && data.reply) {
        setMessages(m => [...m, { role: 'assistant', content: data.reply }]);
      } else if (res.status === 429) {
        setError('Muitas mensagens em pouco tempo. Aguarde um minuto e tente de novo.');
      } else {
        setError('O assistente está indisponível agora. Tente novamente em instantes.');
      }
    } catch {
      setError('Sem conexão. Verifique sua internet e tente de novo.');
    } finally {
      setSending(false);
    }
  };

  // Renderização leve do texto do assistente: links viram âncoras clicáveis e
  // **trechos** viram negrito (o modelo usa às vezes, mesmo instruído a não usar).
  const renderBold = (text, keyBase) =>
    text.split(/\*\*([^*]+)\*\*/g).map((seg, i) =>
      i % 2 === 1
        ? <strong key={`${keyBase}-${i}`} style={{ fontWeight: 600 }}>{seg}</strong>
        : <span key={`${keyBase}-${i}`}>{seg}</span>);

  const renderContent = text => {
    const parts = text.split(/(https?:\/\/[^\s)]+)/g);
    return parts.map((p, i) => /^https?:\/\//.test(p)
      ? <a key={i} href={p.replace('https://zcheckapp.com/', '/')} style={{ color: 'inherit', fontWeight: 600, wordBreak: 'break-all' }}>{p.replace('https://zcheckapp.com', '')}</a>
      : renderBold(p, i));
  };

  const showSuggestions = messages.length === 1;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px 0', display: 'flex', flexDirection: 'column' }}>
      <Breadcrumb items={[{ label: 'Ajuda', href: '/ajuda' }, { label: 'Assistente' }]} />

      <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 12, marginTop: 16, display: 'flex', flexDirection: 'column', minHeight: '60vh' }}>
        {/* Mensagens */}
        <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '85%', padding: '10px 14px', fontSize: 14.5, lineHeight: 1.6, whiteSpace: 'pre-wrap',
                borderRadius: m.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                background: m.role === 'user' ? C.ink : '#EDF3F7',
                color: m.role === 'user' ? 'white' : C.ink,
              }}>
                {renderContent(m.content)}
              </div>
            </div>
          ))}
          {sending && (
            <div style={{ display: 'flex' }}>
              <div style={{ padding: '10px 14px', borderRadius: '12px 12px 12px 4px', background: '#EDF3F7', color: C.muted, fontSize: 14 }}>
                Digitando…
              </div>
            </div>
          )}
          {error && (
            <p style={{ fontSize: 13, color: C.critical, textAlign: 'center' }}>{error}</p>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Sugestões iniciais */}
        {showSuggestions && (
          <div style={{ padding: '0 16px 12px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {SUGGESTIONS.map(s => (
              <button key={s} onClick={() => send(s)}
                style={{ fontSize: 13, fontWeight: 500, color: C.ink, background: 'white', border: `1.5px solid ${C.border}`, borderRadius: 999, padding: '8px 14px', cursor: 'pointer' }}>
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Entrada */}
        <form
          onSubmit={e => { e.preventDefault(); send(input); }}
          style={{ display: 'flex', gap: 8, padding: 12, borderTop: `1px solid ${C.border}` }}
        >
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Escreva sua dúvida…"
            aria-label="Sua mensagem"
            maxLength={1500}
            style={{ flex: 1, fontSize: 15, color: C.ink, background: C.bg, padding: '12px 14px', border: `1.5px solid ${C.border}`, borderRadius: 10, outline: 'none' }}
          />
          <button type="submit" disabled={sending || !input.trim()}
            style={{ padding: '0 20px', borderRadius: 10, border: 'none', background: sending || !input.trim() ? C.mutedLight : C.ink, color: 'white', fontSize: 14, fontWeight: 600, cursor: sending || !input.trim() ? 'default' : 'pointer' }}>
            Enviar
          </button>
        </form>
      </div>

      <p style={{ fontSize: 12, color: C.mutedLight, textAlign: 'center', marginTop: 12, lineHeight: 1.6 }}>
        O assistente responde com base nos artigos da Central de Ajuda e pode cometer erros.
        Ele não acessa dados da sua conta. Para isso, fale com a gestão da sua empresa ou veja{' '}
        <Link href="/ajuda/conta-e-acesso" style={{ color: C.muted, fontWeight: 600 }}>Conta e acesso</Link>.
      </p>
    </div>
  );
}
