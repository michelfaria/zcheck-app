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
