'use client';

import {
  ClipboardCheck, LayoutGrid, BarChart3, Settings2, Users, Award, Star, Activity, Store,
} from 'lucide-react';
import { C, R, W, T, greenOnDark } from '../lib/tokens';

/**
 * Fonte única dos destinos de navegação do app.
 *
 * Estava dentro do BottomNav (app/app/page.js). Subiu para cá porque agora
 * existem DUAS navegações — barra inferior no celular, rail lateral no desktop
 * — e elas não podem divergir por construção.
 *
 * `group` só é usado pelo rail: com 3 destinos (colaborador) cabeçalho de grupo
 * é ruído; a partir de 5 a ausência dele é lista indiferenciada.
 *
 * `short` é o rótulo da BARRA INFERIOR; `label` segue valendo no rail, onde há
 * 240px e nada precisa ser abreviado.
 *
 * Por que encurtar: a barra tem 6 destinos em 390px = 65px por alvo, ~57px
 * úteis. Medido com a Inter real a 12px, "RELATÓRIOS" ocupa 82px, "GERENCIAR"
 * 76 e "EXECUTAR" 70 — nenhum cabe. Era por isso que o rótulo vivia em 9px,
 * abaixo do piso de 12px que o próprio tokens.js define, e ainda assim quebrava
 * em duas linhas. Encolher a fonte disfarçava; encurtar o texto resolve.
 *
 * As três escolhas também alinham o padrão: todo rótulo vira substantivo, como
 * Painel, Equipe e Unidades já eram — "Executar" era o único verbo.
 */
export const NAV_ITEMS = [
  { id: 'executar', label: 'Executar', short: 'Rotina', icon: ClipboardCheck, group: 'Operação' },
  { id: 'painel', label: 'Painel', icon: LayoutGrid, group: 'Operação' },
  // J.I.T. (Just In Time): o resumo do que importa na operação AGORA. Também é
  // destino, não só pop-up de abertura — fechado o pop-up, ele sumia até o dia
  // seguinte. Só papéis de gestão o recebem (MANAGER_ROLES).
  { id: 'jit', label: 'J.I.T.', icon: Activity, group: 'Operação' },
  // Ranking das unidades. Cada loja tem seu ID Operacional, como o colaborador
  // tem o dele em "Meu ID" — mesma ideia de identidade, outra escala.
  { id: 'unidades', label: 'Unidades', icon: Store, group: 'Operação' },
  { id: 'relatorios', label: 'Relatórios', short: 'Dados', icon: BarChart3, group: 'Análise' },
  { id: 'equipe', label: 'Equipe', icon: Star, group: 'Pessoas' },
  { id: 'id', label: 'Meu ID', icon: Award, group: 'Pessoas' },
  { id: 'gerenciar', label: 'Gerenciar', short: 'Config', icon: Settings2, group: 'Configuração' },
  { id: 'usuarios', label: 'Usuários', icon: Users, group: 'Configuração' },
];

/**
 * Ordem da barra inferior — deliberadamente diferente da ordem do rail.
 *
 * `usuarios` NÃO está aqui: no celular ele passou a viver dentro de Gerenciar,
 * como sub-aba. Isso abriu o lugar que o J.I.T. ocupa agora — antes o acesso
 * a ele era um botão de largura inteira repetido no topo de TODAS as abas.
 * Seis é o teto real: com 390px cada alvo fica com ~57px úteis, e é o que os
 * rótulos `short` foram medidos para caber — ver NAV_ITEMS.
 */
export const BOTTOM_NAV_ORDER = ['executar', 'painel', 'jit', 'relatorios', 'gerenciar', 'id', 'equipe'];

/**
 * Rail lateral do desktop (>= BP.desktop). Quem decide se ele ou a BottomNav
 * aparece é o CSS (`.zc-sidenav` / `.zc-bottomnav` em globals.css), não JS:
 * renderizar os dois custa ~7 botões de DOM e evita `useMediaQuery`, que no App
 * Router devolve `false` no servidor e piscaria o layout errado no primeiro
 * paint.
 *
 * Superfície `ink`: gravidade institucional sem introduzir cor nova. Texto
 * secundário em `inkMuted` (5.62:1 sobre ink — `muted` ali daria 2.11:1 e
 * reprovaria AA). O acento da loja NÃO entra aqui: `unit.color` é escolhido
 * pelo gestor e é cor não medida; o item ativo usa `greenOnDark` (6.66:1).
 */
export default function SideNav({
  tab, setTab, allowedTabs, pendingCount = 0, jitSignal = false, idSignal = false, unitName, dateLabel,
}) {
  const items = NAV_ITEMS.filter(it => allowedTabs.includes(it.id));
  if (items.length <= 1) return null;
  const grouped = items.length >= 5;

  // Agrupa ANTES de renderizar: sem isso o cabeçalho de seção existiria só
  // visualmente e a relação não chegaria ao leitor de tela (WCAG 1.3.1).
  const groups = [];
  for (const it of items) {
    const key = grouped ? it.group : '_';
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(it);
    else groups.push({ key, items: [it] });
  }
  // Cabeçalho para um item só é rótulo, não navegação: `gestao` não tem `id`,
  // então "Pessoas" ficaria com uma linha e o rail viria com 4 cabeçalhos para
  // 6 destinos — mais cromo que conteúdo. `key` continua único (chave do React);
  // quem some é só o cabeçalho.
  for (const g of groups) g.head = g.key !== '_' && g.items.length >= 2 ? g.key : null;

  return (
    <nav className="zc-sidenav" aria-label="Navegação principal" style={{
      width: 240, flexShrink: 0, background: C.ink, flexDirection: 'column',
      padding: '16px 0 12px', position: 'sticky', top: 0, alignSelf: 'flex-start',
      height: '100vh', overflowY: 'auto',
    }}>
      <div style={{ padding: '0 18px 20px' }}>
        <img src="/zcheck-logo.png" alt="ZCheck"
          style={{ height: 26, width: 'auto', objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
      </div>

      {groups.map(g => {
        const headId = g.head ? `zc-navgrp-${g.head}` : undefined;
        return (
          <div key={g.key} role={headId ? 'group' : undefined} aria-labelledby={headId}>
            {headId && (
              <div id={headId} style={{
                padding: '16px 18px 6px', fontSize: T.label, fontWeight: W.semibold,
                textTransform: 'uppercase', letterSpacing: '0.08em', color: C.inkMuted,
              }}>{g.head}</div>
            )}
            {g.items.map(it => {
              const Icon = it.icon;
              const active = tab === it.id;
              const showBadge = it.id === 'usuarios' && pendingCount > 0;
              const showDot = (it.id === 'jit' && jitSignal) || (it.id === 'id' && idSignal);
              return (
                <button
                  key={it.id}
                  onClick={() => setTab(it.id)}
                  aria-current={active ? 'page' : undefined}
                  // O nome acessível vive no BOTÃO. Num <span> genérico o
                  // aria-label é descartado pela spec ARIA, e o leitor de tela
                  // anunciaria só "Usuários 3", sem dizer o que o 3 é.
                  aria-label={showBadge ? `${it.label}, ${pendingCount} solicitações pendentes` : (showDot ? `${it.label}, há novidades` : undefined)}
                  style={{
                    position: 'relative', display: 'flex', alignItems: 'center', gap: 11,
                    width: '100%', padding: '9px 18px', border: 'none', textAlign: 'left',
                    background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
                    color: active ? '#fff' : C.inkMuted,
                    fontSize: T.bodySm, fontWeight: active ? W.semibold : W.medium,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                  {active && <span aria-hidden="true" style={{
                    position: 'absolute', left: 0, top: 6, bottom: 6, width: 3,
                    background: greenOnDark, borderRadius: '0 2px 2px 0',
                  }} />}
                  <Icon size={18} color="currentColor" aria-hidden="true" style={{ flexShrink: 0 }} />
                  {it.label}
                  {showDot && (
                    <span aria-hidden="true" style={{
                      width: 8, height: 8, borderRadius: R.pill, background: C.warning, flexShrink: 0,
                    }} />
                  )}
                  {showBadge && (
                    <span aria-hidden="true" style={{
                      marginLeft: 'auto', background: C.warning, color: '#fff', fontSize: T.label,
                      fontWeight: W.semibold, minWidth: 20, height: 20, borderRadius: R.pill,
                      display: 'grid', placeItems: 'center', padding: '0 6px',
                    }}>{pendingCount}</span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}

      {/* Com 3 destinos (colaborador) o rail sobraria vazio, e vazio em tela
          grande lê como "não tem conteúdo". O bloco de contexto preenche com
          informação — e não é navegável, de propósito. */}
      {!grouped && (
        <div style={{ marginTop: 'auto', padding: '14px 18px 0', borderTop: '1px solid rgba(255,255,255,0.10)' }}>
          <div style={{
            fontSize: T.label, fontWeight: W.semibold, textTransform: 'uppercase',
            letterSpacing: '0.08em', color: C.inkMuted,
          }}>Hoje</div>
          <div style={{ color: '#fff', fontSize: T.bodySm, fontWeight: W.semibold, marginTop: 6 }}>{unitName}</div>
          <div style={{ color: C.inkMuted, fontSize: T.caption, marginTop: 2 }}>{dateLabel}</div>
        </div>
      )}
    </nav>
  );
}
