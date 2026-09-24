/**
 * ZCheck — o que uma rodada PEDE de quem confere.
 *
 * Fica em lib/ pelo mesmo motivo declarado no cabeçalho de `rounds.js`: regra
 * de negócio enterrada num componente React de 13 mil linhas não tem teste.
 * Aqui tem (tests/conferencia.spec.js), e isto decide o que a liderança vê
 * primeiro — errar a ordem é mandar alguém começar pelo lugar errado todo dia.
 *
 * `foraDoPrazo` entra PRONTO em vez de ser calculado aqui: a régua de prazo é
 * uma só no app inteiro (`completionOnTime`, que resolve o horário no fuso da
 * loja) e duplicá-la seria criar a segunda. Quem chama já a tem em mãos.
 */

/**
 * Os cinco sinais de uma rodada, e nada além disso.
 *
 * São as mesmas perguntas que o modal de conferência já faz ao abrir — crítico
 * pendente, faltou foto, fora do prazo, incompleta — mais a NOTA DO OPERADOR,
 * que é o único sinal que vem de baixo para cima. Uma rodada sem nenhum deles
 * é "limpa": nada nela pede atenção antes de alguém olhar.
 *
 * @param {object} completion   a rodada, com `items`
 * @param {Array}  itensTemplate  itens do checklist (só `photoRequired` importa)
 * @param {boolean} foraDoPrazo  resultado de `completionOnTime(...) === false`
 */
export function classificarRodada(completion, itensTemplate = [], foraDoPrazo = false) {
  const itens = completion?.items || [];
  const criticoPendente = itens.some(i => i?.critical && !i?.done);
  const naoExecutados = itens.filter(i => !i?.done).length;
  // Foto obrigatória mora no TEMPLATE, não na execução: é o único sinal que
  // precisa do cruzamento, e é o que revela "marcou como feito e não provou".
  const semFoto = itens.some(i => {
    const t = (itensTemplate || []).find(x => x?.id === i?.id);
    return !!(t?.photoRequired && i?.done && !i?.hasPhoto);
  });
  const notaOperador = itens.some(i => (i?.note || '').trim());
  return {
    criticoPendente,
    semFoto,
    foraDoPrazo: !!foraDoPrazo,
    incompleta: naoExecutados > 0,
    notaOperador,
    naoExecutados,
    limpa: !(criticoPendente || semFoto || foraDoPrazo || naoExecutados > 0 || notaOperador),
  };
}

/**
 * GRAVIDADE — o número que ordena a fila.
 *
 * Por gravidade e NUNCA por volume: volume põe em cima a maior pilha, que
 * costuma ser o checklist mais frequente e menos arriscado, e treina quem
 * confere a começar pelo trabalho mais barato.
 *
 * Os pesos seguem a ordem de risco que o produto já usa: crítico não executado
 * é risco de operação; foto faltando é prova que não existe; fora do prazo é o
 * que mais pesa no índice da liderança. Incompleta e nota do operador entram
 * com 1 porque pedem LEITURA, não ação imediata.
 */
export const GRAVIDADE = {
  criticoPendente: 3,
  semFoto: 2,
  foraDoPrazo: 2,
  incompleta: 1,
  notaOperador: 1,
};

export const gravidadeDe = flags => Object.entries(GRAVIDADE)
  .reduce((soma, [k, peso]) => soma + (flags?.[k] ? peso : 0), 0);

/**
 * Agrupa rodadas por CHECKLIST × SETOR e ordena por gravidade.
 *
 * O eixo é o checklist porque é onde a repetição mora e onde o julgamento é o
 * mesmo julgamento: o critério de "Fechamento Cozinha bem-feito" não muda entre
 * segunda e domingo. Setor entra na chave porque o mesmo checklist em dois
 * setores são duas rotinas com critérios diferentes.
 *
 * Empate de gravidade desempata pela pendência MAIS ANTIGA — a que já esperou
 * demais, não a mais recente.
 *
 * @param {Array<{c: object, f: object}>} analisadas  rodada + flags
 */
export function agruparPorChecklist(analisadas, prazoDe = () => null) {
  const mapa = new Map();
  (analisadas || []).forEach(x => {
    const key = `${x.c.templateId || x.c.templateName}|${x.c.sector || ''}`;
    if (!mapa.has(key)) {
      mapa.set(key, {
        key,
        titulo: x.c.templateName || 'Checklist',
        setor: x.c.sector || '',
        prazo: prazoDe(x.c),
        rodadas: [],
        gravidade: 0,
      });
    }
    const g = mapa.get(key);
    g.rodadas.push(x);
    g.gravidade += gravidadeDe(x.f);
  });

  return [...mapa.values()]
    .map(g => ({
      ...g,
      limpas: g.rodadas.filter(x => x.f.limpa).length,
      // As rodadas de dentro seguem o mesmo critério do grupo: quem abrir
      // encontra o pior caso em cima, não o mais recente.
      rodadas: [...g.rodadas].sort((a, b) => gravidadeDe(b.f) - gravidadeDe(a.f)
        || (a.c.date || '').localeCompare(b.c.date || '')),
    }))
    .sort((a, b) => b.gravidade - a.gravidade
      || (a.rodadas[0]?.c.date || '').localeCompare(b.rodadas[0]?.c.date || ''));
}

/**
 * O CORTE da conferência — a partir de quando o veredito da liderança passa a
 * ter consequência no placar (decisão do Michel em 24/09/2026).
 *
 * Duas regras nasceram juntas e usam o mesmo corte:
 *   · a produtividade (`REVIEW_POINT_FACTOR`, lib/stats.js): ressalva vale
 *     metade, reprovada vale negativo;
 *   · o checklist 100% (`tarefaFeita`, logo abaixo): tarefa reprovada não
 *     conta como feita, e o checklist deixa de contar como completo.
 *
 * Julgamento dado antes, quando reprovar não mexia nesses números, não passa a
 * mexer depois do fato — o passado da aderência fica como foi medido.
 * Reconferir uma execução antiga regrava `reviewed_at` (a RPC faz upsert com
 * `now()`), e aí é um julgamento novo e passa a valer.
 *
 * É um INSTANTE, não um dia: `reviewedAt` chega em UTC, e cortar pelo
 * `slice(0, 10)` dele faria uma conferência das 21h de 23/09 em Brasília contar
 * como 24/09. O horário oficial do corte é o de Brasília.
 *
 * Fica FORA desta régua o `taskCounts` do índice do colaborador (ranking.js),
 * que desde 26/07 trata reprovada como não feita sem corte nenhum. Mudar aquele
 * agora mexeria no ranking de dois meses para trás.
 */
export const CONFERENCIA_CUTOFF = '2026-09-24T00:00:00-03:00';
const CONFERENCIA_CUTOFF_MS = Date.parse(CONFERENCIA_CUTOFF);

/**
 * O veredito que VALE para o placar desta tarefa — ou null, quando ela não foi
 * julgada ou foi julgada antes do corte (e então conta como antes). Veredito
 * sem `reviewedAt` também é null: sem saber QUANDO foi dado não há como saber
 * se a régua vale para ele, e na dúvida não se tira nada de ninguém.
 */
export function verdictInForce(item) {
  const r = item?.review;
  if (!r?.verdict || !r.reviewedAt) return null;
  const t = Date.parse(r.reviewedAt);
  return Number.isFinite(t) && t >= CONFERENCIA_CUTOFF_MS ? r.verdict : null;
}

export const reprovadaVigente = item => verdictInForce(item) === 'reprovado';

/**
 * A tarefa conta como FEITA para as métricas? Marcada E não reprovada.
 *
 * É a régua de MEDIÇÃO — aderência, "Checklists 100%", "feito do entregue",
 * status e taxa do Painel, J.I.T., índices de loja e liderança. Não é a régua
 * de EXECUÇÃO: a tela de quem executa, o "Concluir" e o carryover seguem
 * olhando `i.done`. Reprovar não desmarca a tarefa nem a devolve para a lista
 * de ninguém — ela foi feita, a liderança disse que não serve, e isso é placar.
 */
export const tarefaFeita = item => !!item?.done && !reprovadaVigente(item);
