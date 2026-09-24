// ============================================================================
// Motor de leitura do Zeca (assistente de suporte da Central de Ajuda).
//
// Módulo PURO: recebe as linhas já lidas do banco e devolve status de saúde,
// métricas e os temas recorrentes. Sem Supabase, sem Anthropic, sem `process` —
// é o que permite testar tudo em `tests/support-insights.spec.mjs` sem sessão,
// e o que mantém a rota do Core fina.
//
// Duas leituras convivem de propósito:
//   - TEMAS (classify): rótulos estáveis do domínio, feitos para comparar
//     semana contra semana e apontar o artigo que deveria resolver a dúvida.
//   - TERMOS (topTerms): descoberta bruta, pega assunto novo que ainda não tem
//     tema nem artigo. O que cai em "sem tema" é a fila de conteúdo a escrever.
// ============================================================================

// ── Temas do domínio ────────────────────────────────────────────────────────
// `article` aponta o artigo da Central que já cobre o tema (quando existe):
// pergunta recorrente COM artigo = o Zeca ou a busca não estão levando a ele;
// pergunta recorrente SEM artigo = lacuna de conteúdo.
export const TOPICS = [
  { id: 'pin_login', label: 'PIN e login',
    article: '/ajuda/conta-e-acesso/esqueci-meu-pin-ou-codigo',
    re: /\bpin\b|senha|login|logar|entrar no app|acesso bloqueado|suspens/i },
  { id: 'codigo_empresa', label: 'Código da empresa',
    article: '/ajuda/primeiros-passos/como-acessar-com-o-codigo-da-empresa',
    re: /c[óo]digo da empresa|c[óo]digo do zcheck|qual (é |e )?o c[óo]digo/i },
  { id: 'instalar_app', label: 'Instalar o app no celular',
    article: '/ajuda/primeiros-passos/como-instalar-o-app-no-celular',
    re: /instalar|baixar|play store|app ?store|[íi]cone na tela|pwa/i },
  { id: 'executar_checklist', label: 'Executar e concluir checklist',
    article: '/ajuda/usando-checklists/como-executar-um-checklist',
    re: /concluir|finalizar|marcar (o |os )?item|executar checklist|como fa[çc]o o checklist/i },
  { id: 'checklist_sumiu', label: 'Checklist não aparece',
    article: '/ajuda/problemas-comuns/checklist-nao-aparece',
    re: /n[ãa]o aparece|sumiu|desapareceu|n[ãa]o t[áa] aparecendo|cad[êe] o checklist/i },
  { id: 'atraso', label: 'Atraso e dia anterior',
    article: '/ajuda/usando-checklists/checklist-atrasado',
    re: /atrasad|fora do prazo|pendente desde|esqueci de registrar|ontem/i },
  { id: 'foto', label: 'Fotos e evidências',
    article: '/ajuda/problemas-comuns/foto-nao-anexa-ou-nao-salva',
    re: /foto|imagem|c[âa]mera|anexar|evid[êe]ncia/i },
  { id: 'offline', label: 'Internet e modo offline',
    article: '/ajuda/problemas-comuns/sem-internet-modo-offline',
    re: /offline|sem internet|sem sinal|wi-?fi|n[ãa]o carrega|travad|lento/i },
  { id: 'criar_checklist', label: 'Criar e editar checklists',
    article: '/ajuda/para-gestores/como-criar-e-editar-checklists',
    re: /criar (um )?checklist|editar checklist|novo checklist|modelo|template|importar csv/i },
  { id: 'usuarios_vagas', label: 'Usuários, acessos e vagas',
    article: '/ajuda/para-gestores/aprovar-acessos-e-gerenciar-usuarios',
    re: /aprovar|novo (usu[áa]rio|colaborador|funcion[áa]rio)|vaga|limite de usu[áa]rio|cadastrar (algu[ée]m|pessoa)/i },
  { id: 'lojas_setores', label: 'Lojas, setores e tipos',
    article: '/ajuda/para-gestores/lojas-setores-e-tipos',
    re: /nova loja|outra loja|unidade|setor|trocar de loja/i },
  { id: 'plano_cobranca', label: 'Plano, preço e cobrança',
    article: '/ajuda/para-gestores/planos-e-vagas',
    re: /pre[çc]o|plano|assinatura|cobran[çc]a|pagamento|fatura|quanto custa|cancelar/i },
  { id: 'relatorios', label: 'Relatórios e painel',
    article: '/ajuda/para-gestores/relatorios-desempenho-e-evidencias',
    re: /relat[óo]rio|painel|exportar|pdf|csv|desempenho|ader[êe]ncia|confer[êe]ncia/i },
  { id: 'equipe', label: 'Equipe e reconhecimento',
    article: '/ajuda/para-gestores/equipe-e-reconhecimento',
    re: /reconhecimento|elogio|ranking|equipe|folga|dia fechado/i },
];

export function classify(question) {
  const q = String(question || '');
  for (const t of TOPICS) if (t.re.test(q)) return t.id;
  return null;
}

// ── Termos frequentes ───────────────────────────────────────────────────────
const STOP = new Set([
  'a','o','as','os','um','uma','uns','umas','de','do','da','dos','das','em','no','na','nos','nas',
  'por','para','pra','pro','com','sem','sobre','ao','aos','à','às','e','ou','mas','que','se','é',
  'ser','sou','são','está','esta','estou','tem','ter','tenho','têm','foi','vai','vou','quero',
  'preciso','pode','posso','como','qual','quais','quando','onde','porque','por que','quem','isso',
  'isto','esse','essa','este','aqui','ali','lá','já','não','sim','mais','menos','muito','bem','só',
  'meu','minha','seu','sua','nosso','nossa','eu','ele','ela','eles','elas','nós','você','vocês',
  'me','te','lhe','nos','dele','dela','app','zcheck','fazer','faço','fez','tá','ta','pq','oi','olá',
]);

const words = s => String(s || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9\s]/g, ' ')
  .split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));

// Unigramas + bigramas por frequência. O bigrama só entra se aparecer pelo
// menos 2×, senão a lista vira ruído de frase solta.
export function topTerms(questions, limit = 12) {
  const uni = new Map();
  const bi = new Map();
  for (const q of questions || []) {
    const ws = words(q);
    const seen = new Set();
    ws.forEach((w, i) => {
      if (!seen.has(w)) { uni.set(w, (uni.get(w) || 0) + 1); seen.add(w); }
      if (i < ws.length - 1) {
        const pair = `${w} ${ws[i + 1]}`;
        if (!seen.has(pair)) { bi.set(pair, (bi.get(pair) || 0) + 1); seen.add(pair); }
      }
    });
  }
  const all = [
    ...[...bi.entries()].filter(([, n]) => n >= 2).map(([term, n]) => ({ term, count: n, kind: 'bigram' })),
    ...[...uni.entries()].map(([term, n]) => ({ term, count: n, kind: 'word' })),
  ];
  // Palavra que só existe dentro de um bigrama já listado não repete na lista.
  const inBigram = new Set(all.filter(t => t.kind === 'bigram').flatMap(t => t.term.split(' ')));
  return all
    .filter(t => t.kind === 'bigram' || !inBigram.has(t.term))
    .filter(t => t.count > 1)
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
    .slice(0, limit);
}

// ── Saúde do assistente ─────────────────────────────────────────────────────
// `status`:
//   ativo      → responde agora (ou respondeu na última verificação)
//   degradado  → responde, mas pior (sem base, sem log, muita reprovação)
//   inativo    → NÃO responde: a rota pública devolve 503/500 para o usuário
//
// Cada motivo carrega `fix` porque o painel existe para agir, não para admirar.
// Traduz o erro cru da API no motivo que o painel mostra. As três causas reais
// de um assistente mudo têm conserto DIFERENTE, e a mensagem da API é o único
// lugar onde elas se distinguem:
//   401 authentication_error  → a chave existe mas não vale (foi o caso de
//                               24/09/2026: variável cadastrada, chave revogada)
//   400 credit balance        → a conta está sem crédito
//   404 model                 → o modelo saiu do ar ou o nome mudou
// Sem essa distinção, "verificação falhou" manda procurar no lugar errado.
function probeReason(rawError) {
  const error = String(rawError || 'erro desconhecido');
  const msg = error.toLowerCase();

  if (/authentication_error|api key is invalid|invalid x-api-key|401/.test(msg)) {
    return {
      code: 'invalid_key',
      label: 'Chave da API inválida',
      detail: `A ANTHROPIC_API_KEY está cadastrada, mas a Anthropic a recusa: ${error}. Chave revogada, apagada no console ou colada com erro.`,
      fix: 'Gere uma chave nova em console.anthropic.com, atualize ANTHROPIC_API_KEY na Vercel e PUBLIQUE de novo — variável alterada só vale no próximo deploy.',
    };
  }
  if (/credit|billing|quota|insufficient/.test(msg)) {
    return {
      code: 'no_credit',
      label: 'API sem crédito',
      detail: `Erro devolvido pela API: ${error}`,
      fix: 'Recarregue créditos no console da Anthropic (plano Max não dá crédito de API).',
    };
  }
  if (/model/.test(msg) && /not.?found|does not exist|deprecat/.test(msg)) {
    return {
      code: 'bad_model',
      label: 'Modelo indisponível',
      detail: `Erro devolvido pela API: ${error}`,
      fix: 'O nome do modelo mudou ou saiu do ar — atualize a constante MODEL na rota do assistente.',
    };
  }
  if (/rate.?limit|429|overloaded|529/.test(msg)) {
    return {
      code: 'rate_limited',
      label: 'API sobrecarregada ou no limite',
      detail: `Erro devolvido pela API: ${error}`,
      fix: 'Costuma passar sozinho. Rode "Testar agora" em alguns minutos; se persistir, confira os limites da conta.',
    };
  }
  return {
    code: 'probe_failed',
    label: 'A última verificação falhou',
    detail: `Erro devolvido pela API: ${error}`,
    fix: 'Rode "Testar agora" para confirmar; se repetir, confira a chave e o modelo.',
  };
}

export function healthFrom({
  hasApiKey, hasServiceKey = true, articleCount = 0, lastProbe = null,
  lastChatAt = null, chats7 = 0, down7 = 0, now = Date.now(),
} = {}) {
  const reasons = [];
  let status = 'ativo';
  const worse = s => {
    const rank = { ativo: 0, degradado: 1, inativo: 2 };
    if (rank[s] > rank[status]) status = s;
  };

  if (!hasApiKey) {
    worse('inativo');
    reasons.push({
      code: 'no_api_key', severity: 'inativo',
      label: 'Sem chave da API Anthropic',
      detail: 'A variável ANTHROPIC_API_KEY não existe neste ambiente. Toda pergunta na Central de Ajuda recebe "assistente indisponível" (HTTP 503).',
      fix: 'Cadastre ANTHROPIC_API_KEY no projeto da Vercel e publique de novo.',
    });
  }

  // Verificação ao vivo (probe): é o único sinal que distingue "chave existe"
  // de "chave funciona" — crédito zerado, chave revogada e modelo removido só
  // aparecem aqui.
  if (lastProbe && lastProbe.ok === false) {
    worse('inativo');
    reasons.push({ severity: 'inativo', ...probeReason(lastProbe.error) });
  } else if (!lastProbe) {
    reasons.push({
      code: 'never_probed', severity: 'info',
      label: 'Nunca verificado ao vivo',
      detail: 'Ninguém testou a resposta do Zeca contra a API ainda — o status abaixo vem só das configurações e das conversas gravadas.',
      fix: 'Clique em "Testar agora" para uma verificação real.',
    });
  }

  if (articleCount === 0) {
    worse('degradado');
    reasons.push({
      code: 'no_knowledge', severity: 'degradado',
      label: 'Base de conhecimento vazia',
      detail: 'Nenhum artigo foi carregado de content/ajuda — sem base, o Zeca responde que não sabe praticamente tudo.',
      fix: 'Confira se os artigos foram para o deploy.',
    });
  }

  if (!hasServiceKey) {
    worse('degradado');
    reasons.push({
      code: 'no_log', severity: 'degradado',
      label: 'Conversas não estão sendo gravadas',
      detail: 'Sem SUPABASE_SERVICE_ROLE_KEY o Zeca responde, mas nada entra em support_chats: sem 👍👎, sem retrospectiva semanal, sem esta análise.',
      fix: 'Cadastre SUPABASE_SERVICE_ROLE_KEY no ambiente.',
    });
  }

  // Qualidade: reprovação alta com volume mínimo para não gritar com 1 voto.
  if (chats7 >= 10 && down7 / chats7 > 0.3) {
    worse('degradado');
    reasons.push({
      code: 'high_negative', severity: 'degradado',
      label: 'Muita resposta reprovada',
      detail: `${down7} de ${chats7} conversas dos últimos 7 dias levaram 👎 (${Math.round((down7 / chats7) * 100)}%).`,
      fix: 'Veja as perguntas reprovadas abaixo e transforme o padrão em diretriz do agente.',
    });
  }

  const silentDays = lastChatAt ? (now - new Date(lastChatAt).getTime()) / 864e5 : null;
  if (silentDays == null) {
    reasons.push({
      code: 'no_traffic', severity: 'info',
      label: 'Nenhuma conversa registrada',
      detail: 'O Zeca ainda não recebeu (ou não gravou) nenhuma pergunta.',
      fix: 'Sem tráfego não há o que analisar — divulgue a Central de Ajuda dentro do app.',
    });
  } else if (silentDays > 14) {
    reasons.push({
      code: 'idle', severity: 'info',
      label: 'Sem uso há mais de 14 dias',
      detail: `A última conversa foi há ${Math.floor(silentDays)} dias.`,
      fix: 'Nada quebrado — só ninguém perguntando.',
    });
  }

  return { status, reasons };
}

// ── Consolidação para o painel ──────────────────────────────────────────────
// `chats`: linhas de support_chats (question, reply, helpful, created_at, session_key)
// `helpEvents`: eventos help_* já lidos da tabela `events`
export function summarize({ chats = [], helpEvents = [], now = Date.now() } = {}) {
  const at = r => new Date(r.created_at || r.occurred_at).getTime();
  const within = (r, days) => now - at(r) <= days * 864e5;
  const chats7 = chats.filter(c => within(c, 7));
  const chats30 = chats.filter(c => within(c, 30));

  const count = (list, f) => list.filter(f).length;
  const volume = {
    total7: chats7.length,
    total30: chats30.length,
    sessions7: new Set(chats7.map(c => c.session_key).filter(Boolean)).size,
    sessions30: new Set(chats30.map(c => c.session_key).filter(Boolean)).size,
    up7: count(chats7, c => c.helpful === true),
    down7: count(chats7, c => c.helpful === false),
    up30: count(chats30, c => c.helpful === true),
    down30: count(chats30, c => c.helpful === false),
  };
  const rated30 = volume.up30 + volume.down30;
  volume.approval30 = rated30 ? Math.round((volume.up30 / rated30) * 100) : null;

  // Série diária (30d) — dia em ISO para o eixo do gráfico.
  const byDay = new Map();
  for (const c of chats30) {
    const day = new Date(at(c)).toISOString().slice(0, 10);
    const row = byDay.get(day) || { day, conversas: 0, negativas: 0 };
    row.conversas += 1;
    if (c.helpful === false) row.negativas += 1;
    byDay.set(day, row);
  }
  const daily = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));

  // Temas (30d): conta, mede reprovação por tema e guarda exemplos reais.
  const buckets = new Map();
  for (const c of chats30) {
    const id = classify(c.question) || '_sem_tema';
    const b = buckets.get(id) || { id, count: 0, down: 0, examples: [] };
    b.count += 1;
    if (c.helpful === false) b.down += 1;
    if (b.examples.length < 3) b.examples.push(String(c.question || '').slice(0, 180));
    buckets.set(id, b);
  }
  const topics = [...buckets.values()]
    .filter(b => b.id !== '_sem_tema')
    .map(b => {
      const t = TOPICS.find(x => x.id === b.id);
      return { ...b, label: t?.label || b.id, article: t?.article || null,
        share: chats30.length ? Math.round((b.count / chats30.length) * 100) : 0 };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const untagged = buckets.get('_sem_tema') || { count: 0, examples: [] };

  // Eventos da Central (30d): busca sem resultado é lacuna de conteúdo pura.
  const ev = helpEvents.filter(e => within(e, 30));
  const searches = ev.filter(e => e.event_type === 'help_search' || e.event_type === 'help_search_results');
  const zeroResults = new Map();
  for (const e of ev) {
    const m = e.metadata || {};
    const q = String(m.query || '').toLowerCase().trim();
    if (e.event_type === 'help_search_results' && m.results === 0 && q) {
      zeroResults.set(q, (zeroResults.get(q) || 0) + 1);
    }
  }
  const articleViews = new Map();
  const articleDown = new Map();
  for (const e of ev) {
    const m = e.metadata || {};
    if (e.event_type === 'help_article_viewed' && m.article) {
      articleViews.set(m.article, (articleViews.get(m.article) || 0) + 1);
    }
    if (e.event_type === 'help_article_feedback' && m.helpful === false && m.article) {
      articleDown.set(m.article, (articleDown.get(m.article) || 0) + 1);
    }
  }
  const sortEntries = (map, limit) => [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));

  return {
    volume,
    daily,
    topics,
    untagged: { count: untagged.count, examples: untagged.examples },
    terms: topTerms(chats30.map(c => c.question), 12),
    negatives: chats30.filter(c => c.helpful === false)
      .sort((a, b) => at(b) - at(a)).slice(0, 15)
      .map(c => ({ question: String(c.question || '').slice(0, 300), reply: String(c.reply || '').slice(0, 400), at: c.created_at })),
    recent: chats.slice(0, 15).map(c => ({
      question: String(c.question || '').slice(0, 300), helpful: c.helpful ?? null, at: c.created_at,
    })),
    central: {
      searches30: searches.length,
      zeroResults: sortEntries(zeroResults, 10),
      topArticles: sortEntries(articleViews, 8),
      badArticles: sortEntries(articleDown, 8),
    },
    lastChatAt: chats[0]?.created_at || null,
  };
}
