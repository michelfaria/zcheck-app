/**
 * ZCheck — Biblioteca setorial de checklists.
 *
 * Conteúdo curado, estático e sem backend: resolve a página em branco do
 * onboarding (arquitetura de informação de 09/07/2026). Adotar um modelo cria
 * uma CÓPIA do tenant, com ids novos — nunca um vínculo vivo com o modelo-mãe,
 * porque toda operação diverge do padrão no dia 2 e um vínculo criaria medo de
 * editar.
 *
 * `critical` marca o que gera risco sanitário, de segurança ou de caixa.
 * `photoRequired` pede evidência — usar com parcimônia (cada foto é fricção).
 *
 * Modelo não promete norma. Item com cara de exigência legal (controlados na
 * farmácia, autoclave e resíduo de saúde no consultório, extintor e AVCB no
 * escritório) fica FORA: o texto de um modelo não pode sugerir que adotá-lo
 * deixa a operação em dia com Anvisa, vigilância ou bombeiros. Cada cliente
 * acrescenta o que o seu responsável técnico exige. Decisão de 24/09/2026 —
 * tests/library-plan.spec.mjs barra sigla de norma no texto dos itens.
 *
 * O evento `template_adopted` (vertical/momento no metadata) mede quais
 * setores realmente adotam — é o dado que orienta a curadoria seguinte, junto
 * com o campo "setor" do waitlist.
 */

// Taxonomia oficial de setores (21/07/2026) — é a MESMA em landing, waitlist e
// onboarding. Food Service agrupa os antigos restaurante/café/padaria (e, desde
// 24/09/2026, hamburgueria); cada modelo guarda o sub-segmento em `segmento`,
// que o onboarding usa para perguntar "qual é a sua operação?" — sem isso,
// escolher Food Service criava os modelos de TODOS os sub-segmentos em cada
// loja. `hint` diz o que o setor abrange. Setores ainda sem modelos existem de propósito: aparecem como
// "em breve" e medem demanda (template_adopted + campo setor do waitlist).
//
// 24/09/2026: Farmácia, Consultório / Clínica e Escritório entram como setores
// próprios (não como segmento de Varejo ou de um "Serviços"), porque a landing
// já os mostra assim e o waitlist mede demanda pelo setor — uma farmácia que
// escolhesse "Varejo" sumiria da conta. Pet Shop ganha modelos com dois
// segmentos (loja e ração · banho e tosa: a casa de ração não recebe checklist
// de tosa) e mantém o rótulo, porque o waitlist grava o rótulo como texto e
// renomear partiria a contagem de quem já escolheu "Pet Shop". Os setores sem
// modelo ficam no fim da lista.
export const LIBRARY_VERTICALS = [
  { id: 'food-service', label: 'Food Service',
    hint: 'Bar, restaurante, café, padaria, hamburgueria, pizzaria, lanchonete' },
  { id: 'hotel', label: 'Hotel / Pousada' },
  { id: 'varejo', label: 'Varejo' },
  { id: 'farmacia', label: 'Farmácia', hint: 'Farmácia e drogaria' },
  { id: 'petshop', label: 'Pet Shop', hint: 'Pet shop, casa de ração, banho e tosa' },
  { id: 'consultorio', label: 'Consultório / Clínica', hint: 'Médico, odontológico, estética, fisioterapia' },
  { id: 'escritorio', label: 'Escritório' },
  { id: 'eventos', label: 'Eventos' },
  { id: 'academia', label: 'Academia' },
];

export const LIBRARY_TEMPLATES = [
  // ── Restaurante ────────────────────────────────────────────────────────────
  {
    id: 'rest-cozinha-abertura', vertical: 'food-service', segmento: 'Restaurante', momento: 'Abertura', area: 'Cozinha',
    descricao: 'Segurança alimentar e preparo da cozinha antes do primeiro pedido.',
    deadline: '10:00',
    items: [
      { text: 'Conferir temperatura das câmaras frias (refrigeração ≤ 5°C, congelados ≤ -12°C)', critical: true },
      { text: 'Verificar validade dos insumos abertos e etiquetados', critical: true },
      { text: 'Checar se não há sinal de pragas (armadilhas, cantos, ralos)', critical: true },
      { text: 'Higienizar bancadas e tábuas de corte', photoRequired: true },
      { text: 'Ligar e testar equipamentos (chapa, fritadeira, forno)' },
      { text: 'Conferir nível de óleo da fritadeira e programar troca se saturado' },
      { text: 'Repor mise en place conforme o movimento previsto' },
      { text: 'Conferir estoque mínimo do dia e anotar faltas para compra' },
      { text: 'Verificar uniforme, touca e higiene da equipe', critical: true },
      { text: 'Abastecer pias com sabonete e papel toalha' },
    ],
  },
  {
    id: 'rest-salao-abertura', vertical: 'food-service', segmento: 'Restaurante', momento: 'Abertura', area: 'Salão',
    descricao: 'Salão pronto para receber o primeiro cliente.',
    deadline: '11:00',
    items: [
      { text: 'Limpar mesas, cadeiras e trocar toalhas quando houver' },
      { text: 'Varrer e passar pano no piso do salão' },
      { text: 'Conferir banheiros: limpeza, papel, sabonete', critical: true, photoRequired: true },
      { text: 'Montar praças: talheres, guardanapos, condimentos' },
      { text: 'Ligar som, ar-condicionado e luzes conforme padrão' },
      { text: 'Conferir cardápios (limpos e completos) e QR codes' },
      { text: 'Testar maquininhas de cartão e impressora de pedidos', critical: true },
      { text: 'Abrir caixa com fundo de troco conferido', critical: true },
    ],
  },
  {
    id: 'rest-cozinha-fechamento', vertical: 'food-service', segmento: 'Restaurante', momento: 'Fechamento', area: 'Cozinha',
    descricao: 'Fechar a cozinha sem risco sanitário nem desperdício.',
    items: [
      { text: 'Armazenar e etiquetar sobras aproveitáveis (nome + data)', critical: true },
      { text: 'Descartar o que passou do ponto — sem "fica para amanhã"', critical: true },
      { text: 'Desligar equipamentos (chapa, fritadeira, forno, exaustor)', critical: true },
      { text: 'Fechar registro de gás', critical: true },
      { text: 'Higienizar bancadas, equipamentos e utensílios', photoRequired: true },
      { text: 'Retirar lixo e higienizar lixeiras' },
      { text: 'Conferir temperatura das câmaras antes de sair', critical: true },
      { text: 'Deixar louça do dia zerada' },
    ],
  },
  {
    id: 'rest-caixa-fechamento', vertical: 'food-service', segmento: 'Restaurante', momento: 'Fechamento', area: 'Caixa',
    descricao: 'Caixa fechado batendo, loja segura.',
    items: [
      { text: 'Conferir fechamento do caixa contra o relatório do sistema', critical: true },
      { text: 'Separar fundo de troco do dia seguinte' },
      { text: 'Guardar numerário no cofre / preparar depósito', critical: true },
      { text: 'Fechar maquininhas e conferir total de cartões', critical: true },
      { text: 'Registrar sangrias e despesas do dia com comprovante' },
      { text: 'Apagar luzes, conferir portas e janelas' },
      { text: 'Ativar alarme ao sair', critical: true },
    ],
  },

  {
    id: 'rest-bar-abertura', vertical: 'food-service', segmento: 'Restaurante', momento: 'Abertura', area: 'Bar',
    descricao: 'Bar abastecido e pronto antes da primeira comanda.',
    deadline: '11:00',
    items: [
      { text: 'Conferir temperatura de geladeiras e chopeira', critical: true },
      { text: 'Verificar validade de sucos, polpas e laticínios abertos', critical: true },
      { text: 'Abastecer gelo e conferir máquina de gelo funcionando' },
      { text: 'Repor destilados, vinhos e cervejas conforme estoque mínimo' },
      { text: 'Cortar frutas e preparar mise en place de drinks' },
      { text: 'Higienizar bancada, coqueteleiras e utensílios', photoRequired: true },
      { text: 'Conferir copos limpos e sem trinca (descartar trincados)' },
      { text: 'Testar comanda eletrônica / impressora do bar', critical: true },
    ],
  },
  {
    id: 'rest-cozinha-intermediario', vertical: 'food-service', segmento: 'Restaurante', momento: 'Intermediário', area: 'Cozinha',
    descricao: 'Virada de turno da linha sem quebra de padrão nem estoque furado.',
    items: [
      { text: 'Passar pendências do turno para quem chega (caderno de virada)', critical: true },
      { text: 'Conferir mise en place restante e repor para o próximo serviço' },
      { text: 'Etiquetar e refrigerar preparos do turno (nome + data)', critical: true },
      { text: 'Limpar linha e trocar cubas/GNs sujas' },
      { text: 'Conferir temperatura das câmaras no meio do dia', critical: true },
      { text: 'Registrar quebras e itens em falta para o 86 do cardápio' },
      { text: 'Retirar lixo acumulado e trocar sacos' },
    ],
  },
  {
    id: 'rest-salao-fechamento', vertical: 'food-service', segmento: 'Restaurante', momento: 'Fechamento', area: 'Salão',
    descricao: 'Salão fechado limpo e montado para abrir rápido amanhã.',
    items: [
      { text: 'Recolher e higienizar condimentos e itens de mesa' },
      { text: 'Limpar mesas e cadeiras, empilhar/organizar conforme padrão' },
      { text: 'Varrer e passar pano no piso do salão' },
      { text: 'Conferir banheiros: limpeza final e ralos', critical: true },
      { text: 'Desligar som, ar-condicionado e luzes não essenciais' },
      { text: 'Recarregar maquininhas e guardar no lugar padrão' },
      { text: 'Conferir portas, janelas e portões trancados', critical: true },
    ],
  },
  {
    id: 'rest-recebimento-intermediario', vertical: 'food-service', segmento: 'Restaurante', momento: 'Intermediário', area: 'Recebimento',
    descricao: 'Mercadoria entra conferida — peso, validade e temperatura.',
    items: [
      { text: 'Conferir nota fiscal contra o pedido (item a item)', critical: true },
      { text: 'Pesar itens vendidos por peso e registrar divergência', critical: true },
      { text: 'Medir temperatura de refrigerados e congelados no recebimento', critical: true },
      { text: 'Recusar e registrar itens fora do padrão (foto da ocorrência)', photoRequired: true },
      { text: 'Conferir validade — o que vence primeiro vai para frente (PVPS)' },
      { text: 'Armazenar em até 30 minutos: frio primeiro, seco depois', critical: true },
      { text: 'Lançar entrada no controle de estoque' },
    ],
  },

  // ── Café ───────────────────────────────────────────────────────────────────
  {
    id: 'cafe-abertura', vertical: 'food-service', segmento: 'Café', momento: 'Abertura', area: 'Bar',
    descricao: 'Bar de café calibrado e pronto para o primeiro cliente.',
    deadline: '08:00',
    items: [
      { text: 'Ligar máquina de espresso e aguardar estabilizar pressão' },
      { text: 'Calibrar moagem e extrair espresso de prova' },
      { text: 'Conferir validade do leite e alternativas vegetais', critical: true },
      { text: 'Purgar vaporizador e conferir limpeza dos bicos', critical: true },
      { text: 'Abastecer balcão: copos, tampas, guardanapos, açúcar/adoçante' },
      { text: 'Montar vitrine de doces e salgados com etiquetas', photoRequired: true },
      { text: 'Conferir temperatura da vitrine refrigerada', critical: true },
      { text: 'Abrir caixa com fundo de troco conferido', critical: true },
    ],
  },
  {
    id: 'cafe-fechamento', vertical: 'food-service', segmento: 'Café', momento: 'Fechamento', area: 'Bar',
    descricao: 'Máquina preservada e vitrine sem sobras vencendo.',
    items: [
      { text: 'Backflush na máquina de espresso com detergente próprio', critical: true },
      { text: 'Lavar porta-filtros, jarras e acessórios' },
      { text: 'Descartar leite aberto ou etiquetar conforme regra', critical: true },
      { text: 'Recolher vitrine: descartar ou etiquetar sobras', critical: true },
      { text: 'Limpar moinho e recolher borra' },
      { text: 'Fechar caixa e conferir contra o sistema', critical: true },
      { text: 'Apagar equipamentos, luzes e ativar alarme', critical: true },
    ],
  },

  {
    id: 'cafe-salao-abertura', vertical: 'food-service', segmento: 'Café', momento: 'Abertura', area: 'Salão',
    descricao: 'Ambiente acolhedor pronto antes do primeiro cliente sentar.',
    deadline: '08:00',
    items: [
      { text: 'Limpar mesas, cadeiras e balcões de apoio' },
      { text: 'Varrer e passar pano no piso' },
      { text: 'Conferir banheiro: limpeza, papel e sabonete', critical: true },
      { text: 'Repor estação de autosserviço (açúcar, canela, guardanapos)' },
      { text: 'Ligar som e luzes conforme padrão da casa' },
      { text: 'Conferir tomadas e wi-fi funcionando (aviso de senha visível)' },
      { text: 'Regar/conferir plantas e vitrine externa', photoRequired: true },
    ],
  },
  {
    id: 'cafe-turno-intermediario', vertical: 'food-service', segmento: 'Café', momento: 'Intermediário', area: 'Bar',
    descricao: 'Troca de turno sem fila crescer nem padrão cair.',
    items: [
      { text: 'Passar pendências e ocorrências para o próximo turno', critical: true },
      { text: 'Purgar e limpar bicos do vaporizador', critical: true },
      { text: 'Repor leite, copos, tampas e insumos do balcão' },
      { text: 'Conferir vitrine: repor ou recolher conforme movimento' },
      { text: 'Fazer sangria do caixa se acima do limite', critical: true },
      { text: 'Limpar bancada e trocar panos de pega' },
      { text: 'Conferir lixo e trocar sacos se necessário' },
    ],
  },

  // ── Hotel / Pousada ────────────────────────────────────────────────────────
  {
    id: 'hotel-recepcao-turno', vertical: 'hotel', momento: 'Abertura', area: 'Recepção',
    descricao: 'Virada de turno da recepção sem perder informação de hóspede.',
    items: [
      { text: 'Ler o livro de ocorrências do turno anterior', critical: true },
      { text: 'Conferir chegadas do dia e preparar fichas/chaves' },
      { text: 'Conferir saídas do dia e pendências de pagamento', critical: true },
      { text: 'Conferir fundo de caixa da recepção', critical: true },
      { text: 'Testar telefone, internet e sistema de reservas' },
      { text: 'Verificar limpeza do lobby e banheiros sociais' },
      { text: 'Conferir solicitações especiais de hóspedes (berço, dieta, late checkout)' },
    ],
  },
  {
    id: 'hotel-governanca-quarto', vertical: 'hotel', momento: 'Intermediário', area: 'Governança',
    descricao: 'Padrão de quarto pronto — o mesmo em todas as unidades habitacionais.',
    items: [
      { text: 'Trocar enxoval completo (cama e banho)' },
      { text: 'Conferir manchas ou danos no enxoval e separar para lavanderia' },
      { text: 'Higienizar banheiro completo', critical: true, photoRequired: true },
      { text: 'Repor amenities, papel higiênico e toalhas' },
      { text: 'Aspirar/varrer piso e tirar pó das superfícies' },
      { text: 'Testar luzes, TV, ar-condicionado e frigobar' },
      { text: 'Conferir e repor frigobar com registro de consumo', critical: true },
      { text: 'Verificar itens esquecidos pelo hóspede anterior e registrar', critical: true },
      { text: 'Foto final do quarto no padrão', photoRequired: true },
    ],
  },

  {
    id: 'hotel-cafe-abertura', vertical: 'hotel', momento: 'Abertura', area: 'Café da Manhã',
    descricao: 'Buffet montado, quente e reposto antes do primeiro hóspede.',
    deadline: '06:30',
    items: [
      { text: 'Montar buffet completo conforme mapa (frios, quentes, pães, frutas)' },
      { text: 'Conferir temperatura dos réchauds e balcão refrigerado', critical: true },
      { text: 'Etiquetar itens para alérgenos (glúten, lactose, ovos)', critical: true },
      { text: 'Testar máquina de café e repor leite/água quente' },
      { text: 'Montar mesas: louça, talheres e guardanapos' },
      { text: 'Definir responsável pela reposição durante o serviço' },
      { text: 'Foto do buffet montado no padrão', photoRequired: true },
    ],
  },
  {
    id: 'hotel-areas-comuns-intermediario', vertical: 'hotel', momento: 'Intermediário', area: 'Áreas Comuns',
    descricao: 'Ronda de meio de dia — lobby, corredores e sociais impecáveis.',
    items: [
      { text: 'Conferir limpeza e organização do lobby' },
      { text: 'Verificar banheiros sociais: limpeza, papel, sabonete', critical: true, photoRequired: true },
      { text: 'Repor água/café de cortesia da recepção' },
      { text: 'Conferir corredores: luzes queimadas, lixo, enxoval esquecido' },
      { text: 'Verificar elevador e escadas limpos e sinalizados' },
      { text: 'Conferir lixeiras externas e cinzeiros' },
      { text: 'Registrar qualquer dano ou manutenção necessária', critical: true },
    ],
  },
  {
    id: 'hotel-piscina-abertura', vertical: 'hotel', momento: 'Abertura', area: 'Piscina / Lazer',
    descricao: 'Área de lazer segura e pronta antes de liberar aos hóspedes.',
    deadline: '09:00',
    items: [
      { text: 'Medir e registrar pH e cloro da piscina', critical: true },
      { text: 'Conferir água límpida e sem objetos no fundo', critical: true },
      { text: 'Passar peneira e aspirar se necessário' },
      { text: 'Organizar espreguiçadeiras e recolher toalhas usadas' },
      { text: 'Repor toalhas limpas no ponto de apoio' },
      { text: 'Conferir sinalização de profundidade e equipamentos de segurança', critical: true },
      { text: 'Verificar chuveiros e lava-pés funcionando' },
    ],
  },
  {
    id: 'hotel-recepcao-fechamento', vertical: 'hotel', momento: 'Fechamento', area: 'Recepção',
    descricao: 'Passagem para a madrugada sem furo de caixa nem hóspede sem resposta.',
    items: [
      { text: 'Registrar ocorrências do dia no livro de turno', critical: true },
      { text: 'Conferir caixa da recepção e registrar sangrias', critical: true },
      { text: 'Revisar chegadas pendentes e no-shows do dia', critical: true },
      { text: 'Preparar lista de acordar/serviços agendados de amanhã' },
      { text: 'Conferir portas de acesso e iluminação externa', critical: true },
      { text: 'Deixar contato de emergência/manutenção visível para o turno da noite' },
    ],
  },

  // ── Varejo ─────────────────────────────────────────────────────────────────
  {
    id: 'varejo-abertura', vertical: 'varejo', momento: 'Abertura', area: 'Piso de Vendas',
    descricao: 'Loja aberta no horário, com piso pronto para vender.',
    deadline: '09:00',
    items: [
      { text: 'Desativar alarme e conferir se não houve ocorrência noturna', critical: true },
      { text: 'Ligar luzes, som e climatização' },
      { text: 'Conferir limpeza do piso de vendas e vitrines' },
      { text: 'Repor produtos nas gôndolas conforme planograma' },
      { text: 'Conferir precificação: etiquetas visíveis e corretas', critical: true },
      { text: 'Abrir caixas com fundo de troco conferido', critical: true },
      { text: 'Testar maquininhas e leitor de código de barras', critical: true },
      { text: 'Conferir vitrine externa e comunicação de ofertas', photoRequired: true },
    ],
  },
  {
    id: 'varejo-fechamento', vertical: 'varejo', momento: 'Fechamento', area: 'Caixa',
    descricao: 'Fechamento com caixa batendo e estoque protegido.',
    items: [
      { text: 'Conferir fechamento de cada caixa contra o sistema', critical: true },
      { text: 'Guardar numerário no cofre / preparar depósito', critical: true },
      { text: 'Registrar quebras, trocas e devoluções do dia' },
      { text: 'Organizar piso e repor o essencial para a abertura' },
      { text: 'Conferir portas de estoque trancadas', critical: true },
      { text: 'Apagar luzes e equipamentos' },
      { text: 'Ativar alarme e conferir fechadura', critical: true },
    ],
  },

  {
    id: 'varejo-estoque-intermediario', vertical: 'varejo', momento: 'Intermediário', area: 'Estoque',
    descricao: 'Recebimento e organização do estoque sem furo de inventário.',
    items: [
      { text: 'Conferir nota fiscal contra o pedido (item a item)', critical: true },
      { text: 'Registrar avarias e divergências com foto', critical: true, photoRequired: true },
      { text: 'Etiquetar e endereçar mercadoria nova no estoque' },
      { text: 'Aplicar PVPS: validade mais curta vai para frente' },
      { text: 'Lançar entrada no sistema no mesmo dia', critical: true },
      { text: 'Manter corredor do estoque livre e organizado' },
      { text: 'Separar pedidos de reposição do piso de vendas' },
    ],
  },
  {
    id: 'varejo-piso-intermediario', vertical: 'varejo', momento: 'Intermediário', area: 'Piso de Vendas',
    descricao: 'Ronda do meio do dia — reposição, preço e experiência de compra.',
    items: [
      { text: 'Repor gôndolas e frentear produtos (frente cheia)' },
      { text: 'Conferir etiquetas de preço x sistema em itens de oferta', critical: true },
      { text: 'Arrumar araras/prateleiras bagunçadas pelo movimento' },
      { text: 'Conferir provadores: limpos e sem peças acumuladas' },
      { text: 'Verificar limpeza do piso e pontos críticos (entrada, caixas)' },
      { text: 'Checar segurança: etiquetas antifurto e câmeras operando', critical: true },
      { text: 'Registrar rupturas (produto em falta) para compra' },
    ],
  },

  // ── Padaria ────────────────────────────────────────────────────────────────
  {
    id: 'padaria-producao-abertura', vertical: 'food-service', segmento: 'Padaria', momento: 'Abertura', area: 'Produção',
    descricao: 'Produção da madrugada organizada e forno pronto.',
    deadline: '06:00',
    items: [
      { text: 'Conferir temperatura de câmaras e fermentadoras', critical: true },
      { text: 'Verificar validade de fermento, ovos e laticínios', critical: true },
      { text: 'Ligar fornos e aguardar temperatura de trabalho' },
      { text: 'Conferir a produção programada do dia contra o pedido' },
      { text: 'Higienizar bancadas e utensílios antes de começar', critical: true },
      { text: 'Pesar e separar ingredientes da primeira fornada' },
      { text: 'Conferir gás e exaustão funcionando', critical: true },
    ],
  },
  {
    id: 'padaria-atendimento-abertura', vertical: 'food-service', segmento: 'Padaria', momento: 'Abertura', area: 'Atendimento',
    descricao: 'Balcão e vitrines prontos para o pico da manhã.',
    deadline: '06:30',
    items: [
      { text: 'Montar vitrines com a primeira fornada e etiquetas de preço', photoRequired: true },
      { text: 'Conferir temperatura das vitrines refrigeradas', critical: true },
      { text: 'Abastecer balcão: sacos, papel, luvas e pinças limpas', critical: true },
      { text: 'Ligar cafeteira e preparar estação de café' },
      { text: 'Conferir troco e abrir caixa', critical: true },
      { text: 'Testar balança e etiquetadora', critical: true },
      { text: 'Conferir limpeza do salão e mesas de apoio' },
    ],
  },
  {
    id: 'padaria-producao-fechamento', vertical: 'food-service', segmento: 'Padaria', momento: 'Fechamento', area: 'Produção',
    descricao: 'Produção fechada limpa e com a madrugada seguinte programada.',
    items: [
      { text: 'Programar produção da madrugada (quantidades por item)', critical: true },
      { text: 'Deixar massas de fermentação longa etiquetadas e refrigeradas', critical: true },
      { text: 'Higienizar masseira, modeladora e bancadas', critical: true },
      { text: 'Desligar fornos e fechar registro de gás', critical: true },
      { text: 'Conferir estoque de farinha e insumos para a madrugada' },
      { text: 'Retirar lixo da produção e limpar ralos' },
      { text: 'Conferir temperatura das câmaras antes de sair', critical: true },
    ],
  },
  {
    id: 'padaria-fechamento', vertical: 'food-service', segmento: 'Padaria', momento: 'Fechamento', area: 'Atendimento',
    descricao: 'Fechar sem sobra estragando e com balcão pronto para amanhã.',
    items: [
      { text: 'Recolher vitrines: separar doação, reaproveitamento e descarte', critical: true },
      { text: 'Etiquetar tudo o que volta para câmara (nome + data)', critical: true },
      { text: 'Higienizar vitrines, balcão e fatiadora', critical: true, photoRequired: true },
      { text: 'Conferir fechamento do caixa contra o sistema', critical: true },
      { text: 'Desligar equipamentos e fechar registro de gás', critical: true },
      { text: 'Retirar lixo e deixar lixeiras higienizadas' },
      { text: 'Ativar alarme ao sair', critical: true },
    ],
  },

  // ── Hamburgueria ───────────────────────────────────────────────────────────
  // A operação gira em torno da chapa, da fritadeira e da expedição: boa parte
  // do movimento sai por delivery, e o erro caro é o pedido que vai errado ou
  // aberto. Por isso a expedição tem checklist próprio.
  {
    id: 'hamb-cozinha-abertura', vertical: 'food-service', segmento: 'Hamburgueria', momento: 'Abertura', area: 'Cozinha',
    descricao: 'Chapa quente, praça montada e carne conferida antes do primeiro pedido.',
    deadline: '11:00',
    items: [
      { text: 'Conferir temperatura das câmaras e refrigeradores (refrigeração ≤ 5°C, congelados ≤ -12°C)', critical: true },
      { text: 'Conferir validade e etiqueta das carnes, blends e molhos abertos', critical: true },
      { text: 'Porcionar e pesar os blends do dia conforme a ficha técnica' },
      { text: 'Ligar a chapa e conferir a temperatura de trabalho' },
      { text: 'Conferir o óleo da fritadeira: nível, cor e data da última troca' },
      { text: 'Montar a praça: pães, queijos, vegetais higienizados e molhos em potes identificados' },
      { text: 'Higienizar bancadas, tábuas e espátulas', photoRequired: true },
      { text: 'Conferir estoque de pães e embalagens para o movimento previsto' },
      { text: 'Verificar uniforme, touca e higiene da equipe', critical: true },
    ],
  },
  {
    id: 'hamb-chapa-intermediario', vertical: 'food-service', segmento: 'Hamburgueria', momento: 'Intermediário', area: 'Cozinha',
    descricao: 'Chapa e praça no padrão entre um pico e outro.',
    items: [
      { text: 'Raspar e limpar a chapa entre os picos' },
      { text: 'Medir a temperatura interna de um hambúrguer de prova no ponto padrão da casa', critical: true },
      { text: 'Repor a praça: o que foi aberto primeiro sai primeiro' },
      { text: 'Descartar molhos e vegetais que passaram do tempo de bancada', critical: true },
      { text: 'Trocar panos e solução sanitizante da bancada' },
      { text: 'Filtrar o óleo da fritadeira se o movimento pedir' },
    ],
  },
  {
    id: 'hamb-expedicao-intermediario', vertical: 'food-service', segmento: 'Hamburgueria', momento: 'Intermediário', area: 'Expedição',
    descricao: 'Pedido certo, fechado e no tempo — no balcão e no delivery.',
    items: [
      { text: 'Conferir cada pedido contra a comanda antes de fechar a embalagem', critical: true },
      { text: 'Lacrar as embalagens de delivery', critical: true },
      { text: 'Separar molhos, guardanapos e talheres por pedido' },
      { text: 'Conferir o tempo de espera dos pedidos prontos no balcão' },
      { text: 'Manter a estação de retirada limpa e organizada' },
      { text: 'Repor embalagens, sacolas e lacres' },
    ],
  },
  {
    id: 'hamb-cozinha-fechamento', vertical: 'food-service', segmento: 'Hamburgueria', momento: 'Fechamento', area: 'Cozinha',
    descricao: 'Chapa limpa, carne guardada e gás fechado antes de sair.',
    items: [
      { text: 'Raspar e limpar a chapa a fundo e desligar', critical: true },
      { text: 'Filtrar ou trocar o óleo da fritadeira e anotar a data' },
      { text: 'Guardar carnes e porções etiquetadas (nome + data)', critical: true },
      { text: 'Descartar sobras de bancada conforme a regra da casa', critical: true },
      { text: 'Higienizar bancadas, tábuas, espátulas e piso', photoRequired: true },
      { text: 'Fechar o registro de gás', critical: true },
      { text: 'Conferir a temperatura das câmaras antes de sair', critical: true },
      { text: 'Retirar o lixo e limpar os ralos' },
    ],
  },

  // ── Farmácia ───────────────────────────────────────────────────────────────
  // Varejo com duas diferenças que custam caro: a geladeira de medicamentos
  // (perdeu a faixa, perdeu o estoque) e o vencido, que na farmácia não pode
  // ficar na gôndola. Exigências de norma (controlados, farmacêutico
  // presente, registro formal de temperatura) NÃO entram como item: ficam para
  // cada farmácia incluir do jeito que o seu responsável técnico pede.
  {
    id: 'farm-loja-abertura', vertical: 'farmacia', momento: 'Abertura', area: 'Loja',
    descricao: 'Geladeira na faixa, caixa aberto e loja pronta antes do primeiro cliente.',
    deadline: '08:00',
    items: [
      { text: 'Desativar o alarme e conferir se não houve ocorrência noturna', critical: true },
      { text: 'Registrar a temperatura da geladeira de medicamentos (entre 2 °C e 8 °C)', critical: true, photoRequired: true },
      { text: 'Anotar temperatura e umidade da loja e do estoque', critical: true },
      { text: 'Ligar luzes, climatização e sistema' },
      { text: 'Abrir o caixa com fundo de troco conferido', critical: true },
      { text: 'Testar maquininhas, leitor de código de barras e impressora', critical: true },
      { text: 'Conferir limpeza do balcão, das gôndolas e da vitrine' },
      { text: 'Conferir a escala do dia e cobrir faltas no balcão' },
    ],
  },
  {
    id: 'farm-estoque-intermediario', vertical: 'farmacia', momento: 'Intermediário', area: 'Estoque',
    descricao: 'Mercadoria entra conferida — lote, validade e frio.',
    items: [
      { text: 'Conferir a nota fiscal contra o pedido (item a item)', critical: true },
      { text: 'Conferir lote e validade de cada item recebido', critical: true },
      { text: 'Guardar os medicamentos de geladeira assim que chegam', critical: true },
      { text: 'Registrar avarias e divergências com foto', critical: true, photoRequired: true },
      { text: 'Guardar pelo PVPS: o que vence primeiro, sai primeiro' },
      { text: 'Separar vencidos, avariados e recolhidos em local identificado — não voltam para a venda', critical: true },
      { text: 'Lançar a entrada no sistema no mesmo dia', critical: true },
    ],
  },
  {
    id: 'farm-loja-intermediario', vertical: 'farmacia', momento: 'Intermediário', area: 'Loja',
    descricao: 'Ronda do meio do dia — validade, preço, falta e frio.',
    items: [
      { text: 'Conferir a validade da seção da vez (rodízio) e retirar o que vence', critical: true },
      { text: 'Registrar a temperatura da geladeira no meio do dia', critical: true },
      { text: 'Repor e frentear gôndolas' },
      { text: 'Conferir etiqueta de preço x sistema nas ofertas', critical: true },
      { text: 'Registrar faltas para compra e encomendas de clientes' },
      { text: 'Fazer sangria do caixa se acima do limite', critical: true },
    ],
  },
  {
    id: 'farm-caixa-fechamento', vertical: 'farmacia', momento: 'Fechamento', area: 'Caixa',
    descricao: 'Caixa batendo, geladeira ligada e loja trancada.',
    items: [
      { text: 'Conferir o fechamento do caixa contra o sistema', critical: true },
      { text: 'Fechar maquininhas e conferir o total de cartões', critical: true },
      { text: 'Guardar o numerário no cofre / preparar depósito', critical: true },
      { text: 'Registrar a temperatura da geladeira e conferir a porta bem fechada', critical: true },
      { text: 'Anotar encomendas e faltas para o dia seguinte' },
      { text: 'Apagar luzes e equipamentos — sem desligar a geladeira de medicamentos', critical: true },
      { text: 'Ativar o alarme e conferir portas', critical: true },
    ],
  },

  // ── Pet Shop · Loja e ração ────────────────────────────────────────────────
  // Casa de ração e a loja do pet shop: sacaria (umidade e praga), granel,
  // vacinas na geladeira e entrega. Banho e tosa é outra operação — tem
  // segmento próprio, para a casa de ração não receber checklist de tosa.
  {
    id: 'pet-loja-abertura', vertical: 'petshop', segmento: 'Loja e ração', momento: 'Abertura', area: 'Loja',
    descricao: 'Ração sem praga nem umidade, geladeira na faixa e caixa aberto.',
    deadline: '08:00',
    items: [
      { text: 'Desativar o alarme e conferir se não houve ocorrência noturna', critical: true },
      { text: 'Procurar sinal de roedor e caruncho na ração a granel e no estoque', critical: true },
      { text: 'Retirar da venda sacos rasgados, úmidos ou abertos', critical: true },
      { text: 'Registrar a temperatura da geladeira de vacinas e medicamentos (entre 2 °C e 8 °C)', critical: true },
      { text: 'Abrir o caixa com fundo de troco conferido', critical: true },
      { text: 'Testar maquininhas e balança', critical: true },
      { text: 'Conferir as entregas agendadas para o dia' },
      { text: 'Conferir limpeza do piso e das vitrines' },
    ],
  },
  {
    id: 'pet-estoque-intermediario', vertical: 'petshop', segmento: 'Loja e ração', momento: 'Intermediário', area: 'Estoque',
    descricao: 'Recebimento conferido e sacaria guardada longe do chão, da parede e dos químicos.',
    items: [
      { text: 'Conferir a nota fiscal contra o pedido (item a item)', critical: true },
      { text: 'Conferir validade e lote de ração, petiscos e medicamentos', critical: true },
      { text: 'Guardar a sacaria sobre estrado, afastada do chão e da parede', critical: true },
      { text: 'Guardar antipulgas, venenos e produtos de limpeza longe das rações', critical: true },
      { text: 'Registrar avarias e divergências com foto', critical: true, photoRequired: true },
      { text: 'Guardar pelo PVPS: o que vence primeiro, sai primeiro' },
      { text: 'Lançar a entrada no sistema no mesmo dia' },
    ],
  },
  {
    id: 'pet-loja-intermediario', vertical: 'petshop', segmento: 'Loja e ração', momento: 'Intermediário', area: 'Loja',
    descricao: 'Ronda do meio do dia — granel, preço, falta e entregas saindo certas.',
    items: [
      { text: 'Granel: recipientes tampados, pá limpa e etiqueta com validade', critical: true },
      { text: 'Repor e frentear gôndolas' },
      { text: 'Conferir etiqueta de preço x sistema nas ofertas', critical: true },
      { text: 'Conferir cada entrega antes de sair: pedido, quantidade e endereço', critical: true },
      { text: 'Registrar faltas para compra' },
      { text: 'Limpar o piso (ração derramada, pelos)' },
    ],
  },
  {
    id: 'pet-caixa-fechamento', vertical: 'petshop', segmento: 'Loja e ração', momento: 'Fechamento', area: 'Caixa',
    descricao: 'Caixa batendo, ração fechada e loja trancada.',
    items: [
      { text: 'Conferir o fechamento do caixa contra o sistema', critical: true },
      { text: 'Fechar maquininhas e conferir o total de cartões', critical: true },
      { text: 'Guardar o numerário no cofre / preparar depósito', critical: true },
      { text: 'Fechar os sacos abertos e tampar os recipientes de granel', critical: true },
      { text: 'Conferir a geladeira de vacinas fechada e na faixa', critical: true },
      { text: 'Retirar o lixo' },
      { text: 'Apagar luzes, ativar o alarme e conferir portas', critical: true },
    ],
  },

  // ── Pet Shop · Banho e tosa ────────────────────────────────────────────────
  // O erro caro aqui é com o animal: machucado que ninguém registrou na
  // chegada, animal sozinho na mesa ou esquecido no secador, animal que não
  // foi entregue.
  {
    id: 'pet-banho-abertura', vertical: 'petshop', segmento: 'Banho e tosa', momento: 'Abertura', area: 'Banho e Tosa',
    descricao: 'Agenda confirmada, equipamento seguro e estação higienizada antes do primeiro animal.',
    deadline: '08:30',
    items: [
      { text: 'Conferir a agenda do dia e confirmar horários com os tutores' },
      { text: 'Ler a ficha de cada animal agendado: alergias, restrições e comportamento', critical: true },
      { text: 'Higienizar banheiras, mesas de tosa e caixas de transporte', critical: true, photoRequired: true },
      { text: 'Testar secadores e sopradores', critical: true },
      { text: 'Conferir as máquinas de tosa e as lâminas afiadas e limpas', critical: true },
      { text: 'Conferir estoque de shampoo, condicionador, perfume e toalhas limpas' },
    ],
  },
  {
    id: 'pet-banho-intermediario', vertical: 'petshop', segmento: 'Banho e tosa', momento: 'Intermediário', area: 'Banho e Tosa',
    descricao: 'Cada animal que entra é examinado, vigiado e registrado.',
    items: [
      { text: 'Examinar cada animal na chegada e registrar lesões, pulgas ou carrapatos com foto', critical: true, photoRequired: true },
      { text: 'Nenhum animal fica sozinho na mesa de tosa ou no secador', critical: true },
      { text: 'Conferir a temperatura do secador e da gaiola de secagem', critical: true },
      { text: 'Limpar e desinfetar mesa e banheira entre um animal e outro', critical: true },
      { text: 'Registrar na ficha o serviço feito e o que foi observado' },
      { text: 'Avisar o tutor quando o animal estiver pronto' },
    ],
  },
  {
    id: 'pet-banho-fechamento', vertical: 'petshop', segmento: 'Banho e tosa', momento: 'Fechamento', area: 'Banho e Tosa',
    descricao: 'Todos os animais entregues e a estação pronta para amanhã.',
    items: [
      { text: 'Conferir que todos os animais do dia foram entregues aos tutores', critical: true },
      { text: 'Lavar e desinfetar banheiras, mesas, caixas e gaiolas', critical: true },
      { text: 'Limpar e lubrificar máquinas e lâminas' },
      { text: 'Lavar as toalhas e deixar secando' },
      { text: 'Recolher os pelos e limpar os ralos' },
      { text: 'Desligar secadores e sopradores', critical: true },
      { text: 'Conferir a agenda de amanhã' },
    ],
  },

  // ── Consultório / Clínica ──────────────────────────────────────────────────
  // Genérico de propósito (médico, odontológico, estética, fisioterapia): a
  // sala limpa entre um paciente e outro, o material conferido e a agenda sem
  // furo. Protocolos de biossegurança e de esterilização variam por
  // especialidade e por norma — cada clínica acrescenta os seus.
  {
    id: 'cons-recepcao-abertura', vertical: 'consultorio', momento: 'Abertura', area: 'Recepção',
    descricao: 'Agenda confirmada, sistema no ar e recepção pronta para o primeiro paciente.',
    deadline: '08:00',
    items: [
      { text: 'Desativar o alarme, ligar luzes e climatização' },
      { text: 'Ligar computador, sistema de agenda/prontuário e impressora; testar telefone e internet', critical: true },
      { text: 'Confirmar as consultas do dia e encaixar desistências' },
      { text: 'Conferir recepção e banheiro de pacientes: limpeza, papel, sabonete e álcool em gel', critical: true },
      { text: 'Repor água, copos e café da sala de espera' },
      { text: 'Conferir maquininha e fundo de troco', critical: true },
      { text: 'Conferir pendências de ontem: retornos, exames a entregar, guias de convênio' },
    ],
  },
  {
    id: 'cons-sala-abertura', vertical: 'consultorio', momento: 'Abertura', area: 'Consultório',
    descricao: 'Sala limpa, material conferido e equipamento testado antes do primeiro atendimento.',
    deadline: '08:00',
    items: [
      { text: 'Limpar e desinfetar as superfícies de contato: maca ou cadeira, bancada, maçanetas', critical: true, photoRequired: true },
      { text: 'Trocar o lençol ou papel da maca', critical: true },
      { text: 'Conferir o material do dia: luvas, máscaras, gaze e descartáveis', critical: true },
      { text: 'Conferir a validade de materiais e medicamentos da sala', critical: true },
      { text: 'Conferir materiais esterilizados: embalagem íntegra e dentro do prazo', critical: true },
      { text: 'Conferir o coletor de perfurocortantes montado e abaixo da linha de limite', critical: true },
      { text: 'Ligar e testar os equipamentos da sala' },
    ],
  },
  {
    id: 'cons-sala-intermediario', vertical: 'consultorio', momento: 'Intermediário', area: 'Consultório',
    descricao: 'Virada entre turnos — sala no padrão, prontuário em dia.',
    items: [
      { text: 'Desinfetar as superfícies de contato entre um paciente e outro', critical: true },
      { text: 'Trocar o lençol ou papel da maca a cada paciente', critical: true },
      { text: 'Repor descartáveis e material para o próximo turno' },
      { text: 'Esvaziar o lixo e conferir o nível do coletor de perfurocortantes', critical: true },
      { text: 'Registrar no prontuário os atendimentos do turno', critical: true },
      { text: 'Conferir o banheiro de pacientes', critical: true },
    ],
  },
  {
    id: 'cons-sala-fechamento', vertical: 'consultorio', momento: 'Fechamento', area: 'Consultório',
    descricao: 'Sala limpa, instrumental encaminhado e material pronto para amanhã.',
    items: [
      { text: 'Limpar e desinfetar todas as superfícies e equipamentos', critical: true, photoRequired: true },
      { text: 'Encaminhar o instrumental usado para limpeza e esterilização', critical: true },
      { text: 'Descartar o lixo contaminado no recipiente próprio, separado do lixo comum', critical: true },
      { text: 'Repor o material para o primeiro atendimento de amanhã' },
      { text: 'Guardar medicamentos e materiais em armário fechado' },
      { text: 'Desligar os equipamentos da sala' },
    ],
  },
  {
    id: 'cons-recepcao-fechamento', vertical: 'consultorio', momento: 'Fechamento', area: 'Recepção',
    descricao: 'Recebimentos batendo com a agenda, amanhã confirmado e papel de paciente guardado.',
    items: [
      { text: 'Conferir os recebimentos do dia contra a agenda (particular, convênio, cartão)', critical: true },
      { text: 'Fechar o caixa e guardar o numerário', critical: true },
      { text: 'Registrar faltas e remarcações do dia' },
      { text: 'Enviar a confirmação das consultas de amanhã' },
      { text: 'Guardar em local trancado todo papel com dado de paciente', critical: true },
      { text: 'Desligar computadores, impressora e ar-condicionado' },
      { text: 'Ativar o alarme e trancar as portas', critical: true },
    ],
  },

  // ── Escritório ─────────────────────────────────────────────────────────────
  // A rotina de quem cuida do espaço (recepção, facilities): abrir, manter a
  // copa e o prédio funcionando e fechar sem deixar nada ligado ou aberto.
  {
    id: 'esc-recepcao-abertura', vertical: 'escritorio', momento: 'Abertura', area: 'Recepção',
    descricao: 'Escritório aberto, conectado e limpo antes de a equipe chegar.',
    deadline: '08:30',
    items: [
      { text: 'Desativar o alarme e conferir se não houve ocorrência noturna', critical: true },
      { text: 'Ligar luzes, ar-condicionado e equipamentos compartilhados' },
      { text: 'Conferir internet, wi-fi, telefone e impressora funcionando', critical: true },
      { text: 'Conferir a limpeza de recepção, salas e banheiros (papel e sabonete)' },
      { text: 'Conferir a agenda das salas de reunião e as visitas do dia' },
      { text: 'Receber e distribuir correspondências e entregas' },
    ],
  },
  {
    id: 'esc-copa-intermediario', vertical: 'escritorio', momento: 'Intermediário', area: 'Copa',
    descricao: 'Copa abastecida, limpa e sem comida esquecida.',
    items: [
      { text: 'Repor café, açúcar, copos e água' },
      { text: 'Limpar bancada, pia e micro-ondas' },
      { text: 'Conferir a geladeira da copa e descartar o que venceu' },
      { text: 'Esvaziar o lixo e separar os recicláveis' },
      { text: 'Conferir o galão ou filtro de água dentro da validade' },
    ],
  },
  {
    id: 'esc-instalacoes-intermediario', vertical: 'escritorio', momento: 'Intermediário', area: 'Instalações',
    descricao: 'Ronda do prédio — o problema vira chamado antes de virar reclamação.',
    items: [
      { text: 'Saídas de emergência e corredores desobstruídos', critical: true },
      { text: 'Registrar lâmpada queimada, vazamento ou ar-condicionado com defeito e abrir chamado', critical: true },
      { text: 'Conferir os banheiros: limpeza, papel e sabonete' },
      { text: 'Arrumar as salas de reunião depois do uso' },
      { text: 'Conferir papel e toner da impressora' },
      { text: 'Registrar faltas de material de escritório e de limpeza' },
    ],
  },
  {
    id: 'esc-recepcao-fechamento', vertical: 'escritorio', momento: 'Fechamento', area: 'Recepção',
    descricao: 'Nada ligado, nada aberto e nada confidencial à vista.',
    items: [
      { text: 'Conferir que não ficou visitante no escritório' },
      { text: 'Guardar documentos confidenciais e trancar arquivos e gavetas', critical: true },
      { text: 'Desligar cafeteira, micro-ondas e aparelhos da copa', critical: true },
      { text: 'Desligar ar-condicionado, luzes e equipamentos não essenciais' },
      { text: 'Fechar as janelas', critical: true },
      { text: 'Trancar as portas e ativar o alarme', critical: true },
      { text: 'Registrar as ocorrências do dia para a gestão' },
    ],
  },
];

// ── Plano de adoção (onboarding) ─────────────────────────────────────────────
// Puro, sem React: vive aqui para o teste (tests/library-plan.spec.mjs) poder
// provar o que o onboarding cria sem montar a tela.

const normalizeName = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

/** Sub-segmentos de um setor, na ordem da biblioteca. [] se o setor não tem. */
export function segmentosDoSetor(vertical) {
  return [...new Set(LIBRARY_TEMPLATES.filter(t => t.vertical === vertical && t.segmento).map(t => t.segmento))];
}

/**
 * Para cada loja, mapeia cada modelo do setor para o setor da loja de nome
 * equivalente; sem equivalente, cai no primeiro setor da loja.
 *
 * `segmentos` filtra os sub-segmentos (ex.: só Hamburgueria). Vazio ou nulo
 * não filtra — é o caso dos setores que não têm sub-segmento, como Hotel.
 *
 * Nomes: o checklist se chama "Área — Momento". Dois sub-segmentos podem ter o
 * mesmo par (Bar — Abertura existe em Restaurante e em Café) e cair no mesmo
 * setor; aí o nome leva o sub-segmento entre parênteses, senão a loja ficaria
 * com dois checklists de nome idêntico.
 */
export function planoDaBiblioteca(vertical, units, segmentos = null) {
  const filtro = segmentos && segmentos.length ? new Set(segmentos) : null;
  const models = LIBRARY_TEMPLATES.filter(t => t.vertical === vertical && (!filtro || !t.segmento || filtro.has(t.segmento)));
  const plan = [];
  (units || []).forEach(u => {
    const sectors = u.sectors || [];
    models.forEach(m => {
      const sector =
        sectors.find(s => normalizeName(s) === normalizeName(m.area)) ||
        sectors.find(s => normalizeName(s).includes(normalizeName(m.area)) || normalizeName(m.area).includes(normalizeName(s))) ||
        sectors[0] || m.area;
      plan.push({ model: m, unit: u, sector, name: `${m.area} — ${m.momento}` });
    });
  });
  const vezes = new Map();
  const chave = p => `${p.unit.id}|${normalizeName(p.sector)}|${p.name}`;
  plan.forEach(p => vezes.set(chave(p), (vezes.get(chave(p)) || 0) + 1));
  return plan.map(p => (vezes.get(chave(p)) > 1 && p.model.segmento
    ? { ...p, name: `${p.name} (${p.model.segmento})` }
    : p));
}
