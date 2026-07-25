'use client';

import { useEffect } from 'react';

/**
 * Estado de navegação do app na URL.
 *
 * Antes, `tab` e `unitId` eram `useState` puro em AppInner: sem URL, sem deep
 * link, sem botão voltar do navegador e — o que mais custava ao gestor — **sem
 * poder abrir duas janelas lado a lado**, que é literalmente como se compara
 * duas lojas no desktop. Nenhum ajuste de largura resolvia isso; era estrutural.
 *
 * Implementado com a History API crua, e não com `useSearchParams`, de
 * propósito: `useSearchParams` obriga a página a virar dinâmica ou a viver
 * dentro de um <Suspense>, e /app é estática hoje. `history.pushState` não tem
 * esse custo e é o suficiente aqui.
 *
 * Usa `pushState` (não `replaceState`) para que voltar no navegador desfaça a
 * troca de aba — comportamento que o usuário de desktop espera.
 */

const KEY_TAB = 'aba';
const KEY_UNIT = 'loja';

export function readUrlState() {
  if (typeof window === 'undefined') return { tab: null, unitId: null };
  const q = new URLSearchParams(window.location.search);
  return { tab: q.get(KEY_TAB), unitId: q.get(KEY_UNIT) };
}

/** Escreve sem recarregar. `push=false` para a primeira sincronização, que não
 *  deve criar entrada de histórico. */
export function writeUrlState({ tab, unitId }, push = true) {
  if (typeof window === 'undefined') return;
  const q = new URLSearchParams(window.location.search);
  if (tab) q.set(KEY_TAB, tab); else q.delete(KEY_TAB);
  if (unitId) q.set(KEY_UNIT, String(unitId)); else q.delete(KEY_UNIT);
  const qs = q.toString();
  const url = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
  if (url === `${window.location.pathname}${window.location.search}`) return;
  window.history[push ? 'pushState' : 'replaceState'](null, '', url);
}

/**
 * Mantém aba e loja em sincronia com a URL nos dois sentidos.
 *
 * `ready` existe porque o app monta antes de saber o papel do usuário: aplicar
 * a aba da URL antes de `allowedTabs` existir mandaria o colaborador para uma
 * aba que ele não pode ver.
 */
export function useAppUrlState({ ready, tab, setTab, allowedTabs, unitId, setUnitId, canSwitchUnit, unitIds }) {
  // URL → estado, na montagem e no voltar/avançar do navegador.
  useEffect(() => {
    if (!ready) return;
    const apply = () => {
      const { tab: t, unitId: u } = readUrlState();
      if (t && allowedTabs.includes(t) && t !== tab) setTab(t);
      if (canSwitchUnit && u !== null) {
        if (u === 'todas') {
          if (unitId !== null) setUnitId(null);
        } else {
          // A URL só carrega string; o id real pode ser número. Resolver contra
          // a lista devolve o id no TIPO certo — comparar string com number
          // faria `ACTIVE_UNITS.find(x => x.id === unitId)` falhar em silêncio.
          const real = unitIds.find(id => String(id) === u);
          if (real !== undefined && real !== unitId) setUnitId(real);
        }
      }
    };
    apply();
    window.addEventListener('popstate', apply);
    return () => window.removeEventListener('popstate', apply);
    // `tab`/`unitId` ficam fora das deps de propósito: este efeito é o sentido
    // URL → estado. Incluí-los faria os dois sentidos brigarem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, allowedTabs, canSwitchUnit, unitIds]);

  // Estado → URL.
  useEffect(() => {
    if (!ready) return;
    const cur = readUrlState();
    const first = cur.tab === null && cur.unitId === null;
    writeUrlState({ tab, unitId: canSwitchUnit ? (unitId ?? 'todas') : null }, !first);
  }, [ready, tab, unitId, canSwitchUnit]);
}
