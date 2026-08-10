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
