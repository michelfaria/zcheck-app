/**
 * ZCheck — as lojas do IBR (semente single-tenant).
 *
 * Movido de `app/app/page.js` na Fase 1b da consolidação de abas. Nenhuma linha
 * de lógica mudou: só endereço. Ver `docs/PLANO_CONSOLIDACAO_ABAS.md`.
 *
 * REGRA: não pode importar de `app/`.
 */

// UNITS são as lojas do IBR — herança de quando o app era single-tenant. Vários
// componentes liam esta constante direto, o que fazia QUALQUER empresa ver
// IBR1/IBR2/IBR3. Use `useUnits()` no lugar: o provider injeta as unidades do
// tenant logado (ACTIVE_UNITS). O default abaixo só serve ao IBR, que ainda
// depende da constante enquanto não migra para dados dinâmicos.
export const UNITS = [
  {
    id: 'ibr1', name: 'IBR1', color: '#2F6F5E',
    shifts: ['Manhã', 'Tarde'],
    sectors: ['Salão', 'Cozinha'],
  },
  {
    id: 'ibr2', name: 'IBR2', color: '#C2622E',
    shifts: ['Manhã', 'Tarde'],
    sectors: ['Salão', 'Caixa', 'Praça de Bebidas', 'Praça de Alimentos'],
  },
  {
    id: 'ibr3', name: 'IBR3', color: '#35577A',
    shifts: ['Manhã', 'Tarde'],
    sectors: ['Salão', 'Caixa', 'Praça de Bebidas', 'Praça de Alimentos'],
  },
];
