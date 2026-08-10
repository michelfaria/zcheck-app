'use client';

/**
 * ZCheck — contextos de tenant (lojas e setores da empresa logada).
 *
 * Movido de `app/app/page.js` na Fase 1b da consolidação de abas. Nenhuma linha
 * de lógica mudou: só endereço. Ver `docs/PLANO_CONSOLIDACAO_ABAS.md`.
 *
 * REGRA: não pode importar de `app/`.
 */

import React from 'react';
import { UNITS } from '../../lib/units';

// Unidades do tenant logado. O provider (em AppInner) injeta ACTIVE_UNITS; o
// default UNITS mantém o IBR funcionando enquanto ele depende da constante.
export const UnitsContext = React.createContext(UNITS);

export const useUnits = () => React.useContext(UnitsContext);

// Linhas de `sectors` do tenant logado ({id, name, unit_id}), para resolver o
// setor de um usuário pelo id. O IBR usa pseudo-ids ('salao'/'cozinha') que não
// existem na tabela, por isso o resolvedor abaixo trata os dois casos.
export const SectorsContext = React.createContext([]);

export const useSectors = () => React.useContext(SectorsContext);
