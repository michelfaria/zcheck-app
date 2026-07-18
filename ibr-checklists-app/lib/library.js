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
 * O evento `template_adopted` (vertical/momento no metadata) mede quais
 * setores realmente adotam — é o dado que orienta a curadoria seguinte, junto
 * com o campo "setor" do waitlist.
 */

export const LIBRARY_VERTICALS = [
  { id: 'restaurante', label: 'Restaurante' },
  { id: 'cafe', label: 'Café' },
  { id: 'hotel', label: 'Hotel / Pousada' },
  { id: 'varejo', label: 'Varejo' },
  { id: 'padaria', label: 'Padaria' },
];

export const LIBRARY_TEMPLATES = [
  // ── Restaurante ────────────────────────────────────────────────────────────
  {
    id: 'rest-cozinha-abertura', vertical: 'restaurante', momento: 'Abertura', area: 'Cozinha',
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
    id: 'rest-salao-abertura', vertical: 'restaurante', momento: 'Abertura', area: 'Salão',
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
    id: 'rest-cozinha-fechamento', vertical: 'restaurante', momento: 'Fechamento', area: 'Cozinha',
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
    id: 'rest-caixa-fechamento', vertical: 'restaurante', momento: 'Fechamento', area: 'Caixa',
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
    id: 'rest-bar-abertura', vertical: 'restaurante', momento: 'Abertura', area: 'Bar',
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
    id: 'rest-cozinha-intermediario', vertical: 'restaurante', momento: 'Intermediário', area: 'Cozinha',
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
    id: 'rest-salao-fechamento', vertical: 'restaurante', momento: 'Fechamento', area: 'Salão',
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
    id: 'rest-recebimento-intermediario', vertical: 'restaurante', momento: 'Intermediário', area: 'Recebimento',
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
    id: 'cafe-abertura', vertical: 'cafe', momento: 'Abertura', area: 'Bar',
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
    id: 'cafe-fechamento', vertical: 'cafe', momento: 'Fechamento', area: 'Bar',
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
    id: 'cafe-salao-abertura', vertical: 'cafe', momento: 'Abertura', area: 'Salão',
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
    id: 'cafe-turno-intermediario', vertical: 'cafe', momento: 'Intermediário', area: 'Bar',
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
    id: 'padaria-producao-abertura', vertical: 'padaria', momento: 'Abertura', area: 'Produção',
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
    id: 'padaria-atendimento-abertura', vertical: 'padaria', momento: 'Abertura', area: 'Atendimento',
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
    id: 'padaria-producao-fechamento', vertical: 'padaria', momento: 'Fechamento', area: 'Produção',
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
    id: 'padaria-fechamento', vertical: 'padaria', momento: 'Fechamento', area: 'Atendimento',
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
];
