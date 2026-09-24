/**
 * Dados de EXEMPLO para as capturas da landing (scripts/landing-shots/run.mjs).
 *
 * Empresa, lojas e pessoas são fictícias — a landing é pública e o repositório
 * também; nenhum nome de colaborador de verdade pode sair daqui. Tudo é
 * determinístico (PRNG com semente fixa): rodar de novo produz a mesma tela, e
 * a diferença entre duas capturas é só a diferença do produto.
 *
 * O "agora" é fixado pelo runner (page.clock) em HOJE às 14:32 no fuso da loja,
 * a mesma hora do card do hero. Tudo aqui é relativo a esse dia.
 */

import { todayStr, addDays } from '../../lib/dates';

export const TZ = 'America/Sao_Paulo';

// mulberry32 — pequeno, rápido e com semente. Math.random mudaria a tela a
// cada rodada e deixaria a captura impossível de revisar por diferença.
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const company = { id: 'exemplo', name: 'Grupo Exemplo', slug: 'exemplo', logo_url: null };

// Nomes curtos de propósito: no celular os botões de loja do cabeçalho têm
// ~80px, e "Loja Shopping" quebrava em duas linhas na captura do hero.
export const units = [
  { id: 'centro', name: 'Loja Sul', color: '#2F6F5E', shifts: ['Manhã', 'Tarde'], sectors: ['Salão', 'Cozinha', 'Bar'], timezone: TZ },
  { id: 'praia', name: 'Loja Praia', color: '#C2622E', shifts: ['Manhã', 'Tarde'], sectors: ['Salão', 'Cozinha', 'Bar'], timezone: TZ },
  { id: 'shopping', name: 'Loja Norte', color: '#35577A', shifts: ['Manhã', 'Tarde'], sectors: ['Salão', 'Cozinha', 'Bar'], timezone: TZ },
];

// Itens por setor e tipo — o vocabulário de um restaurante de verdade, com os
// críticos onde a vigilância sanitária cobra (temperatura, validade, limpeza).
const ITENS = {
  Cozinha: {
    abertura: [
      { text: 'Temperatura da câmara fria (0 a 4 °C)', critical: true, photoRequired: true },
      { text: 'Validade dos insumos abertos', critical: true },
      { text: 'Bancadas e tábuas higienizadas', critical: false },
      { text: 'Mise en place da praça quente', critical: false },
      { text: 'Óleo da fritadeira conferido', critical: false },
      { text: 'Lixeiras com saco e tampa', critical: false },
    ],
    intermediario: [
      { text: 'Reposição das praças', critical: false },
      { text: 'Temperatura do balcão refrigerado', critical: true, photoRequired: true },
      { text: 'Piso seco e sem resíduos', critical: false },
      { text: 'Etiquetas de manipulação atualizadas', critical: true },
    ],
    fechamento: [
      { text: 'Alimentos etiquetados e guardados', critical: true, photoRequired: true },
      { text: 'Fogões e coifa limpos', critical: false },
      { text: 'Gás fechado', critical: true },
      { text: 'Lixo retirado', critical: false },
    ],
  },
  Salão: {
    abertura: [
      { text: 'Mesas e cadeiras limpas e alinhadas', critical: false },
      { text: 'Banheiros limpos e abastecidos', critical: true, photoRequired: true },
      { text: 'Cardápios e talheres repostos', critical: false },
      { text: 'Música e iluminação ligadas', critical: false },
      { text: 'Máquina de cartão carregada', critical: false },
    ],
    intermediario: [
      { text: 'Banheiros revisados', critical: true },
      { text: 'Reposição de guardanapos e molhos', critical: false },
      { text: 'Mesas higienizadas entre clientes', critical: false },
    ],
    fechamento: [
      { text: 'Salão varrido e cadeiras sobre as mesas', critical: false },
      { text: 'Portas e janelas trancadas', critical: true },
      { text: 'Ar-condicionado e luzes desligados', critical: false },
    ],
  },
  Bar: {
    abertura: [
      { text: 'Gelo e freezer abastecidos', critical: true },
      { text: 'Frutas e guarnições cortadas', critical: false },
      { text: 'Chopeira higienizada', critical: true, photoRequired: true },
      { text: 'Estoque de bebidas conferido', critical: false },
    ],
    intermediario: [
      { text: 'Reposição de copos', critical: false },
      { text: 'Bancada seca e organizada', critical: false },
    ],
    fechamento: [
      { text: 'Chopeira desligada e limpa', critical: true },
      { text: 'Contagem de garrafas abertas', critical: false },
      { text: 'Freezer fechado', critical: false },
    ],
  },
};

const TIPOS = [
  { key: 'abertura', nome: 'Abertura', shift: 'Manhã', deadline: '09:00', hora: 7.4 },
  { key: 'intermediario', nome: 'Intermediário', shift: ['Manhã', 'Tarde'], deadline: '16:00', hora: 12.2 },
  { key: 'fechamento', nome: 'Fechamento', shift: 'Tarde', deadline: '23:00', hora: 22.3 },
];

// Id de item único por checklist, como o editor grava. Ids repetidos entre
// checklists (`abertura-1` em três setores) fazem o Painel nomear a tarefa
// errada: o mapa id → texto do `buildJit` fica com o primeiro que aparece.
const slug = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export const templates = units.flatMap(u => u.sectors.flatMap(sector => TIPOS.map(tp => {
  const id = slug(`${u.id}-${sector}-${tp.key}`);
  return {
    id, unitId: u.id, sector, shift: tp.shift, deadline: tp.deadline, active: true,
    name: `${tp.nome} — ${sector}`,
    items: ITENS[sector][tp.key].map((it, i) => ({ id: `${id}-${i + 1}`, ...it })),
  };
})));

// Pessoas fictícias. Três colaboradores por loja + a liderança de cada loja +
// a diretoria. PIN nenhum: a captura não passa pelo login.
const NOMES = {
  centro: ['Ana Souza', 'Bruno Lima', 'Carla Dias'],
  praia: ['Diego Alves', 'Elisa Rocha', 'Felipe Nunes'],
  shopping: ['Gabriela Melo', 'Hugo Ramos', 'Iara Costa'],
};
export const users = [
  { id: 'dir', name: 'Rafael Moreira', role: 'gestao', unitId: null, sectorId: null, active: true },
  ...units.map((u, i) => ({ id: `lid-${u.id}`, name: ['Marcos Pinto', 'Paula Freitas', 'Renata Luz'][i], role: 'lideranca', unitId: u.id, active: true })),
  ...units.flatMap(u => NOMES[u.id].map((name, i) => ({ id: `${u.id}-${i}`, name, role: 'colaborador', unitId: u.id, sectorId: null, active: true }))),
];
export const gestor = users[0];
export const colaboradora = users.find(u => u.id === 'centro-0');
// Quem aparece executando no celular do hero: a cozinha da Praia, a mesma loja
// e o mesmo item que o Painel do notebook aponta — as duas telas contam uma
// história só.
export const operadorPraia = users.find(u => u.id === 'praia-0');

/**
 * Histórico de 35 dias (o ranking das unidades olha 30). A Loja Praia é a que escorrega — e o item crítico que
 * falha nela é o mesmo do card do hero ("câmara fria"), para que a leitura da
 * operação no Painel conte a mesma história que a landing conta.
 */
// Cada loja com o seu ritmo — três lojas com o mesmo número parecem inventadas.
// A Praia é a que escorrega.
const PERFIL = {
  centro: { feito: 0.99, pula: 0.03, atrasa: 0.05 },
  shopping: { feito: 0.975, pula: 0.12, atrasa: 0.12 },
  praia: { feito: 0.93, pula: 0.3, atrasa: 0.35 },
};

export function buildCompletions() {
  const rnd = prng(20260924);
  const hoje = todayStr(TZ);
  const out = [];
  let seq = 0;
  for (let offset = 34; offset >= 0; offset--) {
    const date = addDays(hoje, -offset);
    templates.forEach(t => {
      const tipo = t.id.split('-').pop();
      // Hoje, às 14:32: abertura entregue, intermediário em parte, fechamento ainda não.
      if (offset === 0 && tipo === 'fechamento') return;
      // A abertura da cozinha da Praia não saiu até agora (prazo 09:00): é o
      // "o que atrasou" do Painel, e é o checklist aberto no celular do hero.
      if (offset === 0 && t.id === 'praia-cozinha-abertura') return;
      if (offset === 0 && tipo === 'intermediario' && t.sector !== 'Salão') return;
      const perfil = PERFIL[t.unitId];
      // Um dia sem o intermediário de vez em quando: é o "previsto e não
      // entregue" que derruba a aderência sem precisar de dado absurdo.
      if (tipo === 'intermediario' && rnd() < perfil.pula) return;
      const pessoas = NOMES[t.unitId];
      const quem = users.find(u => u.name === pessoas[(offset + seq) % pessoas.length]);
      const base = TIPOS.find(x => x.key === tipo).hora;
      const atraso = tipo === 'abertura' && rnd() < perfil.atrasa ? 1.1 : 0;
      const horaDec = base + atraso + rnd() * 0.9;
      const hh = String(Math.floor(horaDec)).padStart(2, '0');
      const mm = String(Math.floor((horaDec % 1) * 60)).padStart(2, '0');
      const completedAt = new Date(`${date}T${hh}:${mm}:00-03:00`).toISOString();
      const items = t.items.map(i => {
        let done = rnd() < perfil.feito;
        // Câmara fria da Praia: pendente 3× na semana. A partir de 3 o Painel
        // deixa de listar só como prioridade e vira a "Leitura da operação".
        if (t.unitId === 'praia' && i.text.startsWith('Temperatura da câmara') && [1, 3, 5].includes(offset)) done = false;
        // Uma segunda falha recorrente, em outra loja: sem ela "Prioridades
        // agora" repetia, palavra por palavra, a manchete da leitura.
        if (t.unitId === 'shopping' && i.text.startsWith('Portas e janelas') && [2, 4].includes(offset)) done = false;
        return {
          id: i.id, critical: !!i.critical, required: false, done, note: '',
          hasPhoto: !!i.photoRequired && done,
          doneBy: done ? quem.id : null, doneByName: done ? quem.name : null,
          doneAt: done ? completedAt : null,
        };
      });
      seq += 1;
      out.push({
        id: `c${seq}`, templateId: t.id, templateName: t.name, unitId: t.unitId, sector: t.sector,
        shift: Array.isArray(t.shift) ? t.shift.join(' e ') : t.shift,
        date, completedAt, operatorName: quem.name, operatorUserId: quem.id, items,
        // Conferência: a liderança confere no dia seguinte, e hoje Sul e
        // Norte já conferiram. Na fila da diretoria sobra só o de hoje da
        // Praia — poucas rodadas, como num dia normal. Com 39 esperando, o
        // número mais legível do hero virava "a diretoria herda lição de casa".
        ...(offset > 0 || t.unitId !== 'praia' ? {
          reviewedAt: new Date(`${addDays(date, 1)}T10:00:00-03:00`).toISOString(),
          reviewedByName: 'Marcos Pinto',
          items: items.map(i => ({ ...i, review: i.done ? { verdict: 'aprovada', byName: 'Marcos Pinto', reviewedAt: new Date(`${addDays(date, 1)}T10:00:00-03:00`).toISOString(), comMotivo: false } : undefined })),
        } : {}),
      });
    });
  }
  return out;
}

/** O que a diretoria marcou para tratar ontem — aparece no topo do "Agora". */
export function buildActionPlans() {
  const ontem = addDays(todayStr(TZ), -1);
  return [{
    id: 'plan-1', recId: 'rec-validade', recType: 'critical_fail', unitId: 'centro', jitDate: ontem,
    recText: 'Conferir validade dos insumos abertos na Loja Sul',
  }];
}

/** Marcações ao vivo da rodada (live_tasks), para a tela de execução. */
export function liveTasksFor(templateId, unitId, itemIds, operator) {
  const hoje = todayStr(TZ);
  return itemIds.map((itemId, i) => ({
    template_id: templateId, unit_id: unitId, date: hoje, item_id: itemId, done: true,
    operator_user_id: operator.id, operator_name: operator.name,
    completed_at: new Date(`${hoje}T14:${String(10 + i * 6).padStart(2, '0')}:00-03:00`).toISOString(),
    reopened_count: 0,
  }));
}
