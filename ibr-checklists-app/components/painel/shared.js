'use client';

/**
 * ZCheck — átomos visuais compartilhados pelas views de análise.
 *
 * Painel, J.I.T. e Relatórios desenham as mesmas peças: o cartão com barra
 * lateral, o rótulo de seção, a medalha de posição, a barra de realização. Elas
 * viviam no escopo de módulo de `app/app/page.js`, o que prendia as três views
 * ali dentro — mover qualquer uma criaria o ciclo
 * `components/painel/* → app/app/page.js → components/painel/*`.
 *
 * Extraído na Fase 1a da consolidação de abas. Ver
 * `docs/PLANO_CONSOLIDACAO_ABAS.md`.
 *
 * REGRA: este módulo não pode importar de `app/`. Só de `lib/` e de outros
 * `components/`.
 */

import { useState, useEffect } from 'react';
import { Star } from 'lucide-react';
import { C, R, W, T } from '../../lib/tokens';
import { getPhotoUrl } from '../../lib/sync';

export const ROLE_LABELS = {
  colaborador: 'Colaborador',
  lideranca: 'Liderança',
  gerencia: 'Gerência',
  gestao: 'Diretoria',
};

// Papéis de gestão que recebem o J.I.T. (H1 — ver docs/REVISAO_MVP_v1.3.md §7).
export const MANAGER_ROLES = ['lideranca', 'gerencia', 'gestao'];

export const STATUS_CFG = {
  done: { label: 'Concluído', color: C.success },
  // Âmbar, não verde nem vermelho: foi entregue (não é falha) mas não está
  // completo (não é sucesso). Contraste medido contra C.bg — ver lib/tokens.js.
  partial: { label: 'Parcial', color: C.warning },
  overdue: { label: 'Atrasado', color: C.critical },
  pending: { label: 'Pendente', color: C.pending },
};

/* ------------------------------ small atoms ------------------------------ */

export function Eyebrow({ children }) {
  return (
    <p style={{ fontSize: T.label, fontWeight: W.semibold, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted }}>
      {children}
    </p>
  );
}

export function Ticket({ accent, children, style, ...rest }) {
  // Barra lateral sólida e fina, igual à dos cards do J.I.T.
  // (a versão anterior tinha 10px com círculos perfurados — pedido de 18/07).
  return (
    <div {...rest} style={{ display: 'flex', background: 'white', border: `1px solid ${C.border}`, borderRadius: R.md, overflow: 'hidden', ...style }}>
      <div style={{ width: 4, flexShrink: 0, background: accent }} />
      <div style={{ flex: 1, padding: 12, minWidth: 0 }}>{children}</div>
    </div>
  );
}

/**
 * Nota em estrelas. `Star` do lucide preenchida/vazia no lugar do caractere ★,
 * que herdava a fonte do sistema e variava de largura entre plataformas.
 * O valor vai no `aria-label` do grupo — cinco <span> não dizem "3 de 5".
 */
export function StarRating({ stars, size = 12, color = C.warning, emptyColor = C.mutedLight }) {
  return (
    <span role="img" aria-label={`${stars} de 5 estrelas`} style={{ display: 'inline-flex', gap: 2, flexShrink: 0 }}>
      {[1, 2, 3, 4, 5].map(s => (
        <Star key={s} size={size} aria-hidden
          color={s <= stars ? color : emptyColor}
          fill={s <= stars ? color : 'none'}
          strokeWidth={1.5} />
      ))}
    </span>
  );
}

/**
 * Ícone de perfil. Mostra a foto que a pessoa enviou; sem foto (ou se a URL
 * quebrar) volta para a inicial do nome, que era o comportamento antigo em
 * todas as telas.
 *
 * O fallback por `onError` não é zelo excessivo: a URL vive em `users`, que o
 * app serve do cache offline — um arquivo removido no bucket deixaria um ícone
 * quebrado em toda lista até a próxima sincronização.
 */
export function Avatar({ user, size = 36, bg, fg, style }) {
  const [broken, setBroken] = useState(false);
  const src = user?.avatarUrl;
  const initial = (user?.name || '?').trim().charAt(0).toUpperCase() || '?';
  const base = {
    width: size, height: size, borderRadius: R.pill, flexShrink: 0,
    display: 'grid', placeItems: 'center', overflow: 'hidden',
    background: bg || `${C.muted}1A`, color: fg || C.ink,
    fontSize: Math.max(11, Math.round(size * 0.42)), fontWeight: W.semibold,
    ...style,
  };
  if (src && !broken) {
    return (
      <img src={src} alt="" aria-hidden="true" onError={() => setBroken(true)}
        style={{ ...base, objectFit: 'cover' }} />
    );
  }
  return <div aria-hidden="true" style={base}>{initial}</div>;
}

/** Rótulo de faixa de desempenho (ícone + texto) devolvido por `getRating`. */
export function RatingLabel({ rating, size = 12, style }) {
  if (!rating) return null;
  const { Icon } = rating;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, ...style }}>
      <Icon size={size} aria-hidden style={{ flexShrink: 0 }} /> {rating.label}
    </span>
  );
}

export function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status];
  return (
    <span
      style={{
        fontSize: T.label, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.08em',
        padding: '4px 10px', borderRadius: R.pill, background: `${cfg.color}1A`, color: cfg.color, whiteSpace: 'nowrap',
      }}
    >
      {cfg.label}
    </span>
  );
}

export function EmptyState({ title, desc }) {
  return (
    <div style={{ textAlign: 'center', padding: '32px 16px', border: `1px dashed ${C.border}`, borderRadius: R.md }}>
      <p className="font-display" style={{ fontWeight: W.semibold, color: C.ink }}>{title}</p>
      <p style={{ fontSize: T.bodySm, color: C.muted, marginTop: 4 }}>{desc}</p>
    </div>
  );
}

export function PillButton({ active, accent, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5"
      style={{
        borderRadius: R.sm, fontSize: T.bodySm, fontWeight: W.semibold, border: `1.5px solid ${active ? accent : C.border}`,
        background: active ? accent : 'white', color: active ? C.bg : C.muted,
      }}
    >
      {children}
    </button>
  );
}

export function StatCard({ label, value, sub, accent }) {
  return (
    <Ticket accent={accent}>
      <Eyebrow>{label}</Eyebrow>
      <p className="font-display" style={{ fontSize: 'calc(26px * var(--zc-t-scale))', fontWeight: W.bold, color: C.ink, marginTop: 4 }}>{value}</p>
      {sub && <p style={{ fontSize: T.caption, color: C.muted, marginTop: 2 }}>{sub}</p>}
    </Ticket>
  );
}

export function RateBar({ rate, accent }) {
  return (
    <div style={{ width: '100%', height: 6, background: C.border, borderRadius: 999, overflow: 'hidden', marginTop: 6 }}>
      <div style={{ height: '100%', width: `${Math.min(100, rate)}%`, background: rate >= 80 ? C.success : rate >= 50 ? accent : C.critical }} />
    </div>
  );
}

// Medalha de posição sem emoji: emoji como DADO em painel de gestão custa mais
// credibilidade do que resolve, e o desenho muda de plataforma. Recebe `size`
// porque o Painel também usa esta medalha (antes 🥇🥈🥉).
export function RankBadge({ pos, size = 28 }) {
  const tone = pos === 1 ? C.ink : pos === 2 ? C.muted : C.mutedLight;
  return (
    <span className="font-display" aria-hidden="true" style={{
      width: size, height: size, borderRadius: R.pill, flexShrink: 0,
      display: 'grid', placeItems: 'center',
      background: pos <= 3 ? `${tone}14` : 'transparent',
      border: `1px solid ${pos <= 3 ? `${tone}40` : C.border}`,
      color: tone, fontSize: size <= 20 ? T.label : T.caption, fontWeight: W.bold,
    }}>{pos}</span>
  );
}

export function PhotoModal({ recordId, item, onClose }) {
  const [src, setSrc] = useState(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    (async () => {
      try {
        const url = await getPhotoUrl(recordId, item.id);
        if (url) {
          setSrc(url);
          setStatus('ok');
        } else {
          setStatus('error');
        }
      } catch (e) {
        setStatus('error');
      }
    })();
  }, []);

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 z-50" style={{ background: 'rgba(32,48,43,0.6)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full" style={{ maxWidth: 360, background: 'white', borderRadius: 10, padding: 16 }}>
        <p className="font-display" style={{ fontWeight: W.semibold, color: C.ink, marginBottom: 8 }}>{item.text}</p>
        {status === 'loading' && <p style={{ fontSize: 13, color: C.muted }}>Carregando foto…</p>}
        {status === 'error' && <p style={{ fontSize: 13, color: C.critical }}>Não foi possível carregar a foto.</p>}
        {status === 'ok' && <img src={src} alt={item.text} style={{ width: '100%', borderRadius: 8 }} />}
        {item.note && <p style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>Obs: {item.note}</p>}
        <button onClick={onClose} className="w-full mt-3 py-2" style={{ borderRadius: 6, border: `1px solid ${C.border}`, fontWeight: W.semibold, color: C.ink, background: 'white' }}>
          Fechar
        </button>
      </div>
    </div>
  );
}
