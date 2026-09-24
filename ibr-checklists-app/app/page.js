import Image from 'next/image';
import {
  CheckSquare, LayoutGrid, Camera, WifiOff, EyeOff, MessagesSquare, RotateCcw,
  Check, Eye, Target, TrendingUp, ClipboardCheck, History, ArrowLeftRight, PackageX,
  Trash2, ShieldCheck, Store, Coffee, BedDouble, UtensilsCrossed,
  Pill, PawPrint, Stethoscope, Building2,
} from 'lucide-react';
import { C, R, W, T, greenOnDark } from '../lib/tokens';
import BackToTop from '../components/BackToTop';
import PriceCalculator from '../components/PriceCalculator';
import {
  TRIAL_DAYS, PRICE_PER_UNIT, ANNUAL_DISCOUNT_LABEL, INCLUDED_USERS_PER_UNIT,
  EXTRA_USER_PRICE, includedSeatsFor, formatBRL,
} from '../lib/plans';
import shotPainel from '../public/landing/painel-desktop.png';
import shotChecklist from '../public/landing/checklist-celular.png';
import shotPainelCel from '../public/landing/painel-celular.png';
import shotUnidadesCel from '../public/landing/unidades-celular.png';
import shotId from '../public/landing/id-celular.png';
import shotUnidades from '../public/landing/unidades-desktop.png';
import logo from '../public/zcheck-logo.png';

// Landing pública. Consome os mesmos tokens do app (lib/tokens.js). O CTA é o
// cadastro self-service (/comecar): a empresa cria a conta sozinha, testa 14 dias
// e assina — o fluxo existe (signup + trial + Mercado Pago). Os preços vêm de
// lib/plans.js (fonte única): preço por loja com 10 usuários inclusos (franquia
// somada na empresa) + vaga adicional a R$ 17,00/mês, e a TRANSPARÊNCIA (preço
// público + calculadora, sem reunião comercial) é a premissa de posicionamento
// — o mercado esconde preço; o ZCheck publica. Por isso a vaga adicional
// aparece ao lado do preço da loja em TODO lugar onde há preço: "sem taxa
// escondida" só é verdade se nenhum custo mora só nos Termos.
// As imagens são telas REAIS do app com dados fictícios e nomes genéricos —
// nunca dado inventado apresentado como cliente real (ver LaptopShot).
// Vocabulário: o que a landing nomeia tem de existir no app com o mesmo nome.
// O antigo "J.I.T." virou o bloco "Agora" do Painel em 08/2026 e saiu daqui em
// 24/09/2026.
// Público (decisão de 24/09/2026): qualquer negócio com operação física e
// rotina padronizada, todo dia ou periodicamente (dia da semana, mês, a cada
// N semanas/meses — lib/recurrence.js, 24/09/2026) — não só food
// service. O card de segmento diz se há modelo pronto na biblioteca
// (lib/library.js); onde não há, a promessa é montar do zero ou importar a
// planilha, nunca "modelo pronto" nem conformidade com norma do setor.

// Números do preço já no formato da página, todos derivados de lib/plans.js —
// mudou a tabela lá, muda a landing inteira. A vaga sai SEMPRE com centavos
// ("R$ 17,00"): é como aparece na fatura e nos Termos, e "R$ 17" solto lê
// como valor arredondado.
// Espaço inseparável entre "R$" e o número: com o espaço comum, a quebra de
// linha podia deixar o "R$" no fim de uma linha e o valor na seguinte.
const nb = s => s.replace('R$ ', 'R$\u00A0');
const ANUAL = nb(formatBRL(PRICE_PER_UNIT.annual));
const MENSAL = nb(formatBRL(PRICE_PER_UNIT.monthly));
const VAGA = nb(formatBRL(EXTRA_USER_PRICE, { cents: true }));
const FRANQUIA = INCLUDED_USERS_PER_UNIT;
// '−24%' → '24%': o selo carrega o sinal de menos; no texto corrido ele sobra.
const DESCONTO_ANUAL = ANNUAL_DISCOUNT_LABEL.replace(/^[−-]\s*/, '');
// Saída antecipada do anual: a diferença para o mensal por loja/mês usado
// (Termos v1.2, seção 7). Derivada, nunca escrita à mão — "R$ 30" hoje.
const SAIDA_ANUAL = nb(formatBRL(PRICE_PER_UNIT.monthly - PRICE_PER_UNIT.annual));

const WA = 'https://wa.me/5512988017472?text=Ol%C3%A1%2C%20gostaria%20de%20saber%20mais%20sobre%20o%20ZCheck!';
const SIGNUP = '/comecar';

const Eyebrow = ({ color = C.muted, children }) => (
  <p style={{ fontSize: T.label, fontWeight: W.semibold, letterSpacing: '0.12em', textTransform: 'uppercase', color, marginBottom: 14 }}>
    {children}
  </p>
);

// Telas REAIS do app, capturadas por scripts/landing-shots/run.mjs: os
// componentes de produção montados sobre uma empresa fictícia (Grupo Exemplo,
// 3 lojas). O produto é o de verdade; os dados são de exemplo. As lojas e as
// pessoas têm nome genérico de propósito: a landing nunca apresenta dado
// inventado como se fosse cliente. As imagens ficaram sem o aviso "dados de
// exemplo" por decisão de 24/09/2026.
// Mudou uma dessas telas no app? Rode o script de novo.
const URL_APP = 'suaempresa.zcheckapp.com/app';

// `fetchPriority` à parte de `priority`: no Next 15.5 `priority` só tira o
// lazy e adiciona o preload — sem o atributo, o Chrome baixa a imagem do LCP
// com prioridade baixa (medido: chegava ~600 ms depois do h1).
function LaptopShot({ src, alt, priority = false, fetchPriority, sizes }) {
  return (
    <div className="lp-laptop">
      <div className="lap-lid">
        <div className="lap-screen">
          <div className="lap-bar" aria-hidden>
            <span style={{ background: '#E8695A' }} />
            <span style={{ background: '#E5B23C' }} />
            <span style={{ background: '#57A464' }} />
            <span className="lap-url">{URL_APP}</span>
          </div>
          <div className="lap-img">
            <Image src={src} alt={alt} priority={priority} fetchPriority={fetchPriority} sizes={sizes} placeholder="blur"
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top left', display: 'block' }} />
          </div>
        </div>
      </div>
      <div className="lap-deck" aria-hidden />
    </div>
  );
}

function PhoneShot({ src, alt, loading, sizes, className = '', priority = false, fetchPriority }) {
  return (
    <div className={`lp-phone ${className}`}>
      <div className="phone-frame">
        <span className="phone-vol" style={{ top: '18%' }} aria-hidden />
        <span className="phone-vol" style={{ top: '25%' }} aria-hidden />
        <div className="phone-screen">
          <Image src={src} alt={alt} loading={loading} priority={priority} fetchPriority={fetchPriority} sizes={sizes} placeholder="blur"
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', display: 'block' }} />
        </div>
      </div>
    </div>
  );
}

// Faixa "Feito para o seu negócio" — o escopo inicial de segmentos.
// `modelos: true` só onde a biblioteca (lib/library.js) tem modelo pronto.
// Desde 24/09/2026 todos os cards têm: Food Service, Hotel / Pousada,
// Farmácia, Pet Shop (loja e ração · banho e tosa), Consultório / Clínica e
// Escritório. O card Supermercados saiu no mesmo dia: os modelos de Varejo são
// de loja genérica e não cobrem frio exposto, validade em rodízio, açougue nem
// hortifrúti — volta quando houver segmento Supermercado na biblioteca. Mesmo
// com modelo, o card não promete norma (Anvisa, biossegurança): os modelos
// deixam de fora, de propósito, os itens de exigência legal. Segmento novo sem
// modelo entra com false. `href` fica reservado para as futuras landings por
// segmento; enquanto null, o card não é link.
const SEGMENTS = [
  { id: 'restaurantes', Icon: UtensilsCrossed, nome: 'Bares e restaurantes', frase: 'Abertura da cozinha, câmara fria e fechamento de caixa.', modelos: true, href: null },
  { id: 'cafeterias',   Icon: Coffee,          nome: 'Cafeterias e padarias', frase: 'Produção, vitrine e atendimento prontos antes de abrir.', modelos: true, href: null },
  { id: 'redes',        Icon: Store,           nome: 'Redes de food service', frase: 'O mesmo padrão em todas as unidades, com ranking entre lojas.', modelos: true, href: null },
  { id: 'hotelaria',    Icon: BedDouble,       nome: 'Hotelaria',             frase: 'Recepção, governança e café da manhã conferidos.', modelos: true, href: null },
  { id: 'farmacias',    Icon: Pill,            nome: 'Farmácias',             frase: 'Temperatura da geladeira, validades e abertura da loja.', modelos: true, href: null },
  { id: 'racao',        Icon: PawPrint,        nome: 'Casas de ração e pet shops', frase: 'Estoque, limpeza, banho e tosa, e o fechamento do dia.', modelos: true, href: null },
  { id: 'consultorios', Icon: Stethoscope,     nome: 'Consultórios',          frase: 'Sala pronta, material conferido e limpeza entre atendimentos.', modelos: true, href: null },
  { id: 'escritorios',  Icon: Building2,       nome: 'Escritórios',           frase: 'Abertura, limpeza, equipamentos e fechamento do prédio.', modelos: true, href: null },
];

// Os três pilares — a narrativa de posicionamento.
const PILLARS = [
  { Icon: Eye, title: 'Você enxerga a operação inteira',
    text: 'Com uma loja ou várias, o que foi feito ou não e o que atrasou ficam à vista no Painel. Você não precisa garimpar planilha nem rolar o grupo do WhatsApp atrás de resposta.' },
  { Icon: Target, title: 'O crítico vem primeiro',
    // Sem promessa sobre quando o app interrompe: "o ZCheck só interrompe
    // quando há sinal real" não valia no teste grátis (o convite para assinar
    // aparece a cada entrada da diretoria).
    text: 'Quando um item crítico falha mais de uma vez, ele entra nas prioridades automaticamente.' },
  { Icon: TrendingUp, title: 'A rotina vira hábito da equipe',
    text: 'Consistência na execução constrói cultura, e cultura mantém o padrão mesmo quando você não está.' },
];

export default function LandingPage() {
  return (
    // overflow-x: clip (não hidden): hidden quebra o position:sticky do header —
    // o Chrome trata o ancestral como scroll container e o header deixa de grudar.
    // fontFamily pela variável do next/font (app/layout.js): o nome 'Inter' solto
    // pulava o 'Inter Fallback' de métrica casada, e a troca de fonte refluía o
    // h1 e empurrava o palco de imagens (layout shift em cima do LCP).
    <div style={{ fontFamily: 'var(--font-inter), system-ui, sans-serif', color: C.ink, background: 'white', overflowX: 'clip' }}>
      <style>{`
        @media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth; } }
        .lp-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; text-decoration: none; border-radius: ${R.md}px; font-weight: ${W.semibold}; cursor: pointer; }
        .lp-btn-primary { background: ${C.ink}; color: #fff; padding: 14px 28px; font-size: ${T.body}px; border: none; }
        .lp-btn-primary:hover { background: ${C.inkHover}; }
        .lp-nav-links { transition: color .15s; }
        .lp-nav-links:hover { color: ${C.ink}; }
        .lp-btn-ghost { background: transparent; color: ${C.ink}; padding: 14px 24px; font-size: ${T.body}px; border: 1.5px solid ${C.borderStrong}; }
        .lp-container { max-width: 1120px; margin: 0 auto; padding-left: 40px; padding-right: 40px; }
        .lp-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 56px; align-items: center; }
        .lp-hero-top { display: grid; grid-template-columns: 1.15fr 1fr; gap: 56px; align-items: end; }
        .lp-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        .lp-grid-2x2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
        details.lp-faq summary { cursor: pointer; font-size: ${T.body}px; font-weight: ${W.semibold}; color: ${C.ink}; padding: 16px 0; list-style: none; display: flex; justify-content: space-between; align-items: center; }
        /* A segunda declaração dá texto alternativo vazio ao sinal: sem ela o
           leitor de tela anunciava "mais" depois de cada pergunta. A primeira
           fica de reserva para navegador que não entende a sintaxe com "/". */
        details.lp-faq summary::after { content: '+'; content: '+' / ''; font-size: 20px; color: ${C.muted}; }
        details.lp-faq[open] summary::after { content: '–'; content: '–' / ''; }
        details.lp-faq p { font-size: ${T.bodySm}px; color: ${C.muted}; line-height: 1.7; padding-bottom: 16px; }
        details.lp-faq summary::-webkit-details-marker { display: none; }
        /* 69px = header sticky (68) + a borda de 1px. No html, e não só nas
           seções: vale também para o foco do teclado (Shift+Tab deixava o campo
           focado inteiro debaixo do header, WCAG 2.4.11) e para o pulo do link
           "Pular para o conteúdo". Não somar com scroll-margin nas seções — os
           dois se acumulam e o pulo das âncoras parava 138px abaixo. */
        html { scroll-padding-top: 69px; }
        /* Vitrine de telas reais — hardware em CSS (spec da revisão de design):
           proporções reais (tela 16:10 / celular 9:19,5), bezel escuro, deck
           trapezoidal e sombras em camadas com luz vinda de cima. Tudo em %
           no palco do hero, para notebook e celular escalarem juntos. */
        /* Larguras do palco amarradas ao atributo sizes das duas imagens do hero
           (LaptopShot/PhoneShot no JSX): mudou uma porcentagem aqui, refaça a
           conta lá. */
        .lp-stage { position: relative; max-width: 1000px; margin: 56px auto 0; padding-bottom: 28px; }
        /* O celular encosta só na borda do notebook e desce abaixo do deck:
           a 84%/22% ele tampava "Ainda não", "Tratar" e "Foi útil?" — os
           controles que provam o "aja". */
        .lp-stage .lp-laptop { width: 82%; animation: lp-rise .7s cubic-bezier(.22,1,.36,1) both; }
        .lp-stage .lp-phone { position: absolute; right: 0; bottom: -3%; width: 21%;
          animation: lp-rise .7s .12s cubic-bezier(.22,1,.36,1) both; }
        /* Só transform, sem opacity: pintura com opacidade 0 não conta para o
           LCP, e a imagem do notebook é o LCP do desktop. */
        @keyframes lp-rise { from { transform: translateY(16px); } to { transform: none; } }
        @media (prefers-reduced-motion: reduce) { .lp-stage .lp-laptop, .lp-stage .lp-phone { animation: none; } }
        .lp-laptop { position: relative; }
        .lp-laptop::after { content: ''; position: absolute; left: 8%; right: 8%; bottom: -22px; height: 18px;
          background: radial-gradient(50% 100% at 50% 0%, rgba(8,20,30,0.18), transparent 70%); filter: blur(6px); z-index: -1; }
        .lap-lid { position: relative; background: linear-gradient(180deg, #1B2A38 0%, #0C1926 55%, #0A1622 100%);
          border-radius: 18px 18px 0 0; padding: 14px 12px 12px;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 24px 48px -20px rgba(8,20,30,0.35); }
        .lap-lid::before { content: ''; position: absolute; top: 5px; left: 50%; transform: translateX(-50%);
          width: 4px; height: 4px; border-radius: 999px; background: #223441; box-shadow: 0 0 0 1.5px #0A1622; }
        /* A proporção 16:10 fica na IMAGEM, não na tela inteira: com ela na
           tela, a barra do navegador comia 32px do pé da captura e cortava
           texto no meio. */
        .lap-screen { border-radius: 4px; overflow: hidden; background: ${C.bg};
          display: flex; flex-direction: column; }
        .lap-bar, .lp-browser-bar { background: ${C.ink}; padding: 6px 12px; display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
        .lap-bar > span:not(.lap-url), .lp-browser-bar > span:not(.lap-url) { width: 8px; height: 8px; border-radius: 999px; flex-shrink: 0; }
        .lap-url { margin-left: 8px; font-size: 10.5px; color: rgba(255,255,255,0.7);
          background: rgba(255,255,255,0.1); border-radius: 999px; padding: 2px 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .lap-img { aspect-ratio: 16 / 10; flex: none; position: relative; }
        .lap-deck { position: relative; height: 16px; margin: 0 -34px;
          background: linear-gradient(180deg, #E9EEF3 0%, #D4DCE3 55%, #B9C4CE 100%);
          border-top: 1px solid #F4F7FA; border-radius: 2px 2px 12px 12px;
          clip-path: polygon(0 0, 100% 0, 98.5% 100%, 1.5% 100%);
          box-shadow: 0 12px 24px -8px rgba(8,20,30,0.28); }
        .lap-deck::before { content: ''; position: absolute; top: 0; left: 50%; transform: translateX(-50%);
          width: 104px; height: 7px; background: radial-gradient(ellipse at 50% 0%, #AEBAC5, #CBD4DC 70%);
          border-radius: 0 0 10px 10px; }
        .phone-frame { position: relative; background: #0D1B27; border-radius: 30px; padding: 7px;
          box-shadow: inset 0 0 0 1.5px rgba(255,255,255,0.07), 0 2px 8px rgba(8,20,30,0.22), 0 28px 56px -12px rgba(8,20,30,0.35); }
        .phone-frame::before { content: ''; position: absolute; right: -2.5px; top: 22%; width: 3px; height: 9%;
          background: #0D1B27; border-radius: 0 3px 3px 0; }
        .phone-vol { position: absolute; left: -2.5px; width: 3px; height: 5%; background: #0D1B27; border-radius: 3px 0 0 3px; }
        .phone-screen { position: relative; aspect-ratio: 390 / 844; border-radius: 23px; overflow: hidden; background: white; }
        /* 280px / 76% amarrados aos sizes dos três celulares avulsos (hero no
           celular, Unidades no celular e Meu ID). A sombra é mais curta que a
           do celular do hero: no celular a legenda de Unidades fica logo
           abaixo, e com a sombra longa o cinza dela caía a 3.6:1 (medido). */
        .lp-phone-solo { width: 280px; max-width: 100%; margin: 0 auto; }
        .lp-phone-solo .phone-frame { box-shadow: inset 0 0 0 1.5px rgba(255,255,255,0.07), 0 2px 8px rgba(8,20,30,0.22), 0 16px 28px -14px rgba(8,20,30,0.30); }
        @media (max-width: 820px) { .lp-phone-solo { width: 280px; max-width: 76%; } }
        /* Botão do header: a 320px ele quebrava em duas linhas e espremia o logo. */
        .lp-hdr-cta { padding: 10px 20px; white-space: nowrap; }
        @media (max-width: 359px) { .lp-hdr-cta { padding: 10px 14px; } }
        /* Tablet (duas colunas estreitas): os botões do hero empilham com a
           mesma largura. Sem isso, entre 821 e ~1008px eles quebravam
           desencontrados — e a quebra dependia da fonte carregada, o que ainda
           empurrava o palco de imagens quando a Inter chegava (CLS). */
        @media (min-width: 821px) and (max-width: 1080px) { .lp-hero-ctas { flex-direction: column; align-items: stretch; } }
        /* Moldura de navegador para a tela de desktop fora do hero. */
        .lp-browser { border: 1px solid ${C.border}; border-radius: ${R.lg}px; overflow: hidden; background: white;
          box-shadow: 0 1px 2px rgba(8,20,30,0.06), 0 24px 48px -24px rgba(8,20,30,0.28); }
        .lp-browser-bar { padding: 8px 14px; }
        /* Troca de imagem por largura: no celular o notebook e a moldura de
           navegador viram texto de 3px, então cada um tem uma versão de 390px
           num celular. A escondida é lazy (ou tem sizes de 16px) e não pesa. */
        .lp-only-mob { display: none; }
        @media (max-width: 820px) {
          .lp-only-desk { display: none !important; }
          .lp-only-mob { display: block; }
        }
        @media (max-width: 820px) {
          .lp-container { padding-left: 20px; padding-right: 20px; }
          .lp-grid-2, .lp-grid-3, .lp-grid-2x2 { grid-template-columns: 1fr; }
          .lp-hero-top { grid-template-columns: 1fr; gap: 20px; }
          .lp-nav-links { display: none; }
          .lp-hero-ctas { flex-direction: column; align-items: stretch; }
        }
      `}</style>

      {/* Pulo para o conteúdo (WCAG 2.4.1) — a classe mora em globals.css. */}
      <a className="zc-skip" href="#conteudo">Pular para o conteúdo</a>

      {/* HEADER */}
      <header style={{ background: 'white', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, zIndex: 100 }}>
        <div className="lp-container" style={{ height: 68, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <a href="/" aria-label="Página inicial do ZCheck" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <Image src={logo} alt="ZCheck" width={128} height={32} priority style={{ height: 32, width: 'auto' }} />
          </a>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 28 }} aria-label="Navegação principal">
            <a className="lp-nav-links" href="#por-que" style={{ fontSize: T.bodySm, fontWeight: W.medium, color: C.muted, textDecoration: 'none' }}>Por que ZCheck</a>
            <a className="lp-nav-links" href="#como-funciona" style={{ fontSize: T.bodySm, fontWeight: W.medium, color: C.muted, textDecoration: 'none' }}>Como funciona</a>
            <a className="lp-nav-links" href="#preco" style={{ fontSize: T.bodySm, fontWeight: W.medium, color: C.muted, textDecoration: 'none' }}>Preço</a>
            <a className="lp-nav-links" href="/entrar" style={{ fontSize: T.bodySm, fontWeight: W.medium, color: C.muted, textDecoration: 'none' }}>Entrar</a>
            <a href={SIGNUP} className="lp-btn lp-btn-primary lp-hdr-cta" style={{ fontSize: T.bodySm }}>Começar grátis</a>
          </nav>
        </div>
      </header>

      <main id="conteudo" tabIndex={-1}>

      {/* 1 · HERO — texto em duas colunas e, embaixo, as telas reais: o
          Painel da diretoria no notebook e a execução no celular (desktop), ou
          só o Painel num celular (≤820px — a 390px o notebook virava texto de
          3px). O gradiente vai de branco → bg → tom azulado do ink, com um halo
          verde suave atrás do palco. O tom mais escuro (#EFF4F8) mantém o muted
          acima de 4.5:1 (AA) — e o halo conta: com a legenda debaixo dele em
          força total o muted cai a 4.57:1. Por isso o centro fica em 62%, longe
          da legenda (medido 4.82:1 onde ela está). */}
      <section style={{
        background: `radial-gradient(720px 420px at 50% 62%, rgba(22,163,74,0.08), transparent 70%),
                     linear-gradient(180deg, #FFFFFF 0%, ${C.bg} 55%, #EFF4F8 100%)`,
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div className="lp-container" style={{ paddingTop: 64, paddingBottom: 64 }}>
          <div className="lp-hero-top">
            <div>
              {/* Quem é o cliente, no primeiro olhar, em três grandes setores
                  (decisão de 24/09/2026). A lista completa de segmentos está em
                  "Feito para o seu negócio". */}
              <Eyebrow color={C.success}>Para negócios de Gastronomia, Hospitalidade e Varejo</Eyebrow>
              <h1 style={{ fontSize: 'clamp(32px, 4.5vw, 52px)', fontWeight: W.bold, lineHeight: 1.12, letterSpacing: '-0.02em' }}>
                Saiba onde sua operação precisa de atenção antes que vire problema.
              </h1>
            </div>
            <div>
              <p style={{ fontSize: T.bodyLg, color: C.muted, lineHeight: 1.7, marginBottom: 28 }}>
                Sua equipe faz os checklists pelo celular, e você acompanha de onde
                estiver. O Painel mostra em tempo real o que foi feito ou não em cada loja e o que resolver primeiro.
              </p>
              <div className="lp-hero-ctas" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                <a href={SIGNUP} className="lp-btn lp-btn-primary">Começar teste grátis</a>
                <a href="#como-funciona" className="lp-btn lp-btn-ghost">Ver como funciona</a>
              </div>
              {/* "mensal sem fidelidade", não "cancele quando quiser": o anual
                  (o plano pré-selecionado) tem custo de saída antecipada. */}
              <p style={{ fontSize: T.caption, color: C.muted }}>
                {TRIAL_DAYS} dias grátis · sem cartão para começar · mensal sem fidelidade
              </p>
            </div>
          </div>
          {/* sizes = largura real renderizada: notebook 82% do palco menos a
              moldura (796px no teto), celular 21% menos a moldura (196px). No
              celular (≤820px) o palco é display:none, então o sizes diz 16px e
              o preload do notebook baixa a menor variante em vez da de 640px.
              Um preload grande por largura, nunca dois: no desktop o notebook
              (o LCP) leva priority + fetchPriority; no celular, o Painel no
              celular. O outro de cada par tem sizes de 16px, então o preload
              dele baixa uma variante minúscula. Mudou uma porcentagem de
              .lp-stage ou de .lp-phone-solo no CSS? Refaça esta conta. */}
          <div>
            <div className="lp-stage lp-only-desk">
              <LaptopShot src={shotPainel} priority fetchPriority="high"
                sizes="(max-width: 820px) 16px, (max-width: 1080px) calc(82vw - 90px), 796px"
                alt="Painel da diretoria: o bloco Agora com o que você marcou para tratar, uma falha crítica que se repete na Loja Praia e as prioridades agora, entre elas um checklist atrasado." />
              <PhoneShot src={shotChecklist}
                sizes="(max-width: 820px) 16px, (max-width: 1080px) calc(21vw - 31px), 196px"
                alt="Checklist de abertura da cozinha da Loja Praia no celular: 2 de 6 tarefas feitas e a câmara fria, crítica e com foto obrigatória, ainda por fazer." />
            </div>
            <div className="lp-only-mob" style={{ marginTop: 40 }}>
              <PhoneShot src={shotPainelCel} className="lp-phone-solo" priority fetchPriority="high"
                sizes="(max-width: 408px) calc(76vw - 45px), (max-width: 820px) 266px, 16px"
                alt="Painel no celular da diretoria: o bloco Agora com o que você marcou para tratar, a falha crítica que se repete na Loja Praia e as prioridades agora." />
            </div>
          </div>
        </div>
      </section>

      {/* 2 · O PROBLEMA */}
      <section style={{ padding: '72px 0' }}>
        <div className="lp-container">
          <div style={{ maxWidth: 620, marginBottom: 40 }}>
            <Eyebrow>O problema</Eyebrow>
            <h2 style={{ fontSize: 'clamp(24px, 3vw, 34px)', fontWeight: W.bold, lineHeight: 1.2 }}>
              Você só fica sabendo quando já virou prejuízo.
            </h2>
          </div>
          {/* Quatro cards em 2×2: numa grade de três o quarto ficava sozinho. */}
          <div className="lp-grid-2x2">
            {[
              { Icon: EyeOff, title: 'O desvio aparece tarde', text: 'Papel e planilha registram, mas não avisam. A geladeira que falhou na terça vira perda na sexta.' },
              { Icon: MessagesSquare, title: 'O WhatsApp engole a rotina', text: 'A cobrança se perde no meio das mensagens do grupo, e depois ninguém sabe dizer quem fez o quê e quando.' },
              { Icon: RotateCcw, title: 'Retrabalho sem dono', text: 'Sem evidência, a mesma tarefa é feita duas vezes ou fica por fazer. E você só vê o resultado no fim do mês.' },
              { Icon: PackageX, title: 'O produto que ninguém percebeu que acabou', text: 'Você deixa de vender, prejudica a expectativa do cliente e a imagem da empresa.' },
            ].map(({ Icon, title, text }) => (
              <div key={title} style={{ border: `1px solid ${C.border}`, borderRadius: R.md, padding: 24 }}>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: R.md, background: C.bg, marginBottom: 14 }}>
                  <Icon size={18} color={C.ink} aria-hidden />
                </span>
                <h3 style={{ fontSize: T.bodyLg, fontWeight: W.semibold, marginBottom: 8 }}>{title}</h3>
                <p style={{ fontSize: T.bodySm, color: C.muted, lineHeight: 1.65 }}>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3 · OS TRÊS PILARES — título fixo à esquerda, lista à direita: em
          desktop a seção usa a largura toda em vez de deixar 300px vazios.
          Eram cinco; "Acompanhe de qualquer lugar" repetia o subtítulo do hero
          e "Reconhece quem faz acontecer", a seção A equipe junto. */}
      <section id="por-que" className="zc-on-dark" style={{ background: C.ink, color: 'white', padding: '96px 0' }}>
        <div className="lp-container lp-grid-2" style={{ alignItems: 'flex-start', gap: 48 }}>
          <div>
            <Eyebrow color={greenOnDark}>Por que ZCheck</Eyebrow>
            <h2 style={{ fontSize: 'clamp(28px, 3.4vw, 40px)', fontWeight: W.bold, lineHeight: 1.18, marginBottom: 16 }}>
              Três coisas que um checklist comum não faz por você.
            </h2>
            <p style={{ fontSize: T.body, opacity: 0.75, lineHeight: 1.7, maxWidth: 420 }}>
              Checklist que só registra é o papel de sempre, agora na tela. No ZCheck, o que a
              equipe marca chega ao Painel na hora, e você sabe onde agir.
            </p>
          </div>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {PILLARS.map(({ Icon, title, text }) => (
              <li key={title} style={{ display: 'flex', gap: 16, alignItems: 'flex-start', border: '1px solid rgba(255,255,255,0.18)', borderRadius: R.md, padding: '18px 20px' }}>
                <span style={{ flexShrink: 0, width: 42, height: 42, borderRadius: R.md, background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={20} color={greenOnDark} aria-hidden />
                </span>
                <div>
                  <h3 style={{ fontSize: T.bodyLg, fontWeight: W.semibold, marginBottom: 4 }}>{title}</h3>
                  <p style={{ fontSize: T.bodySm, opacity: 0.78, lineHeight: 1.65 }}>{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 4 · COMO FUNCIONA */}
      <section id="como-funciona" style={{ padding: '72px 0' }}>
        <div className="lp-container">
          <div style={{ maxWidth: 620, marginBottom: 40 }}>
            <Eyebrow>Como funciona</Eyebrow>
            <h2 style={{ fontSize: 'clamp(24px, 3vw, 34px)', fontWeight: W.bold, lineHeight: 1.2 }}>
              Da conta criada ao Painel em três passos.
            </h2>
          </div>
          <div className="lp-grid-3">
            {[
              ['Crie sua conta e monte sua rotina', 'Em poucos minutos, você escolhe um modelo pronto do seu segmento ou começa do zero e ajusta do seu jeito. Se já usa uma planilha, dá para importar.'],
              ['A equipe executa pelo celular', 'Cada colaborador entra com um PIN e vê só os checklists do seu setor. Você escolhe quais tarefas pedem foto para comprovação, e o app funciona sem internet, sem precisar instalar no celular.'],
              ['Você abre o Painel e age', 'Ali você vê, ao longo do dia, o que foi feito ou não e por onde começar. E o que você marcar para tratar volta a aparecer até ser resolvido.'],
            ].map(([t, d], i) => (
              <div key={t} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: R.md, padding: 24 }}>
                <p style={{ width: 34, height: 34, borderRadius: R.pill, background: C.ink, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: W.bold, fontSize: T.body, marginBottom: 14 }}>{i + 1}</p>
                <h3 style={{ fontSize: T.body, fontWeight: W.semibold, marginBottom: 8, lineHeight: 1.4 }}>{t}</h3>
                <p style={{ fontSize: T.bodySm, color: C.muted, lineHeight: 1.65 }}>{d}</p>
              </div>
            ))}
          </div>
          {/* A rede inteira numa tela: o ranking das lojas (aba Unidades). No
              celular, a captura de 390px num celular — a moldura de navegador
              deixava o texto em 3px. As duas são lazy: a escondida (display
              none) nem baixa. */}
          <figure style={{ maxWidth: 880, margin: '56px auto 0' }}>
            <div className="lp-browser lp-only-desk">
              <div className="lp-browser-bar" aria-hidden>
                <span style={{ background: '#E8695A' }} />
                <span style={{ background: '#E5B23C' }} />
                <span style={{ background: '#57A464' }} />
                <span className="lap-url">{URL_APP}</span>
              </div>
              <Image src={shotUnidades} placeholder="blur" sizes="(max-width: 820px) 16px, (max-width: 960px) calc(100vw - 82px), 878px"
                alt="Ranking das três lojas nos últimos 30 dias, cada uma com índice, aderência, tarefas e críticos; a Loja Praia aparece por último."
                style={{ width: '100%', height: 'auto', display: 'block' }} />
            </div>
            <div className="lp-only-mob">
              <PhoneShot src={shotUnidadesCel} className="lp-phone-solo" sizes="(max-width: 408px) calc(76vw - 45px), (max-width: 820px) 266px, 16px"
                alt="Ranking das três lojas nos últimos 30 dias, cada uma com índice, aderência, tarefas e críticos; a Loja Praia aparece por último." />
            </div>
            <figcaption style={{ marginTop: 16, textAlign: 'center', fontSize: T.bodySm, color: C.muted, lineHeight: 1.6 }}>
              <strong style={{ color: C.ink }}>Para quem tem mais de uma loja,</strong> a aba Unidades ordena todas pelo índice
              operacional e mostra onde cada uma escorrega.
            </figcaption>
          </figure>
        </div>
      </section>

      {/* 5 · A EQUIPE JUNTO (ID operacional + reconhecimento) */}
      <section style={{ background: C.bg, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: '72px 0' }}>
        <div className="lp-container lp-grid-2">
          <div>
            <Eyebrow color={C.success}>A equipe junto</Eyebrow>
            <h2 style={{ fontSize: 'clamp(24px, 3vw, 34px)', fontWeight: W.bold, lineHeight: 1.2, marginBottom: 18 }}>
              A equipe vê que fazer direito vale a pena.
            </h2>
            <p style={{ fontSize: T.body, color: C.muted, lineHeight: 1.75, maxWidth: 460 }}>
              Cada colaborador tem um <strong style={{ color: C.ink }}>ID operacional</strong>, e tudo o que ele faz
              vai formando o próprio histórico. Quem cumpre a rotina em dia recebe <strong style={{ color: C.ink }}>reconhecimento</strong>,
              e o bom trabalho não passa despercebido.
            </p>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12, marginTop: 24 }}>
              {[
                ['ID operacional por pessoa', 'O ID reúne nível, índice operacional e conquistas, e registra quem fez cada tarefa e quando.'],
                ['Reconhecimento pela consistência', 'Quem mantém o padrão aparece no ranking da equipe.'],
                ['Cada um vê só o seu', 'A tela mostra só o que é do setor de cada um, então ninguém se perde no checklist dos outros.'],
              ].map(([t, d]) => (
                <li key={t} style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: R.md, padding: '16px 18px' }}>
                  <h3 style={{ fontSize: T.body, fontWeight: W.semibold, color: C.ink, marginBottom: 4 }}>{t}</h3>
                  <p style={{ fontSize: T.bodySm, color: C.muted, lineHeight: 1.6 }}>{d}</p>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <PhoneShot src={shotId} className="lp-phone-solo" sizes="(max-width: 408px) calc(76vw - 45px), 266px"
              alt="Aba Meu ID de uma colaboradora: a conclusão semana a semana e as conquistas desbloqueadas, como Veterano, Guardião do crítico e Semana perfeita." />
          </div>
        </div>
      </section>

      {/* 6 · RECURSOS — seis recursos, cada um com nome e comportamento que
          existem no app hoje. Conferência e pendência que volta entraram em
          24/09/2026 — eram dos recursos mais usados e não apareciam em lugar
          nenhum. O h2 era só para leitor de tela; a grade flutuava sem título. */}
      <section style={{ padding: '72px 0' }}>
        <div className="lp-container">
          <div style={{ maxWidth: 620, marginBottom: 32 }}>
            <Eyebrow>Recursos</Eyebrow>
            <h2 style={{ fontSize: 'clamp(24px, 3vw, 34px)', fontWeight: W.bold, lineHeight: 1.2 }}>
              Tudo incluso, em qualquer plano.
            </h2>
          </div>
          <div className="lp-grid-3">
            {[
              { Icon: CheckSquare, title: 'Checklists por loja, setor e turno', text: 'Abertura, Intermediário e Fechamento, com prazo se você quiser. Cada tarefa tem a sua frequência: todo dia, em dias da semana, todo dia 10 do mês ou a cada 3 meses. Manutenções periódicas podem ter checklist específico, para você não esquecer o que importa.' },
              { Icon: LayoutGrid, title: 'Painel para a gestão', text: 'Você vê como a operação está agora, com base no que a equipe marcou, e pode olhar por loja, por setor ou por pessoa.' },
              { Icon: ClipboardCheck, title: 'Conferência de checklists', text: 'Liderança, gerência e diretoria aprovam, fazem ressalva ou reprovam cada tarefa. O que for reprovado não conta como feito.' },
              // Pendência que volta é por tarefa (opção "cobrar no dia seguinte"
              // no editor, lib/checklists.js) e dura até 7 dias — não é o padrão.
              { Icon: History, title: 'Pendência que volta', text: 'Marque a tarefa para cobrar no dia seguinte. Se ninguém fizer, ela volta mostrando desde quando está pendente, por até 7 dias.' },
              // Sem "histórico completo": o app carrega uma janela recente
              // (lib/completions.js), e as fotos somem em 90 dias (Política de
              // Privacidade).
              { Icon: Camera, title: 'Evidência com foto', text: 'Qualquer item pode exigir foto, guardada por 90 dias. No Painel, filtre por período, loja e setor e exporte em CSV ou PDF.' },
              { Icon: WifiOff, title: 'Funciona offline', text: 'Dá para salvar como app no celular, sem precisar instalar. Sem sinal de internet, a equipe continua marcando e tudo sincroniza depois.' },
            ].map(({ Icon, title, text }) => (
              <div key={title} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: R.md, padding: 22 }}>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: R.md, background: 'rgba(21,128,61,0.08)', marginBottom: 12 }}>
                  <Icon size={18} color={C.success} aria-hidden />
                </span>
                <h3 style={{ fontSize: T.bodySm, fontWeight: W.semibold, marginBottom: 6, lineHeight: 1.4 }}>{title}</h3>
                <p style={{ fontSize: T.bodySm, color: C.muted, lineHeight: 1.6 }}>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7 · SEGMENTOS — "feito para o seu negócio"; mesmo preço em todos.
          Antes do preço: responde "é para mim?" antes de "quanto custa?".
          Config no array SEGMENTS (inclui quem tem modelo pronto). */}
      <section id="para-quem" style={{ background: C.bg, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: '64px 0' }}>
        <div className="lp-container">
          <div style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 28px' }}>
            <h2 style={{ fontSize: 'clamp(22px, 2.6vw, 28px)', fontWeight: W.bold, marginBottom: 10 }}>
              Feito para o seu negócio
            </h2>
            <p style={{ fontSize: T.body, color: C.muted, lineHeight: 1.6 }}>
              Se o seu negócio tem operação física e rotinas que precisam ser cumpridas todo dia ou periodicamente, da limpeza diária à manutenção do mês, o ZCheck é para você.
            </p>
          </div>
          <div className="lp-grid-3">
            {SEGMENTS.map(({ id, Icon, nome, frase, modelos, href }) => {
              const Tag = href ? 'a' : 'div';
              return (
                <Tag key={id} id={`seg-${id}`} {...(href ? { href } : {})}
                  style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: R.md, padding: 20, textDecoration: 'none', display: 'block' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: R.md, background: C.bg, marginBottom: 10 }}>
                    <Icon size={18} color={C.ink} aria-hidden />
                  </span>
                  <h3 style={{ fontSize: T.bodySm, fontWeight: W.bold, color: C.ink, marginBottom: 4 }}>{nome}</h3>
                  <p style={{ fontSize: T.caption, color: C.muted, lineHeight: 1.5 }}>{frase}</p>
                  {modelos && (
                    <p style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 10, fontSize: T.label, fontWeight: W.semibold, color: C.success }}>
                      <Check size={12} aria-hidden /> Modelos prontos
                    </p>
                  )}
                </Tag>
              );
            })}
          </div>
          <p style={{ textAlign: 'center', fontSize: T.bodySm, fontWeight: W.semibold, color: C.ink, marginTop: 24 }}>
            O seu negócio não está na lista? Você monta os checklists em minutos ou importa a sua planilha.
          </p>
        </div>
      </section>

      {/* 8 · PREÇO — preço por loja: anual (R$ 97, herói) e mensal (R$ 127,
          âncora), com 10 usuários inclusos por loja e vaga adicional a
          R$ 17,00/mês nos dois planos. Card + linha dinâmica + os 3 ralos de
          dinheiro do food service, e depois o bloco da transparência: a
          premissa (o antigo manifesto, que ficava entre o hero e o problema,
          antes de quem lê sentir dor nenhuma), os compromissos e o mercado ×
          ZCheck. As perguntas de preço foram para o FAQ único. */}
      <section id="preco" style={{ padding: '96px 0' }}>
        <div className="lp-container">
          <div style={{ textAlign: 'center', maxWidth: 620, margin: '0 auto 32px' }}>
            <Eyebrow>Preço</Eyebrow>
            <h2 style={{ fontSize: 'clamp(28px, 3.4vw, 40px)', fontWeight: W.bold, lineHeight: 1.18, marginBottom: 10 }}>
              Sua operação no padrão, com ou sem você por perto.
            </h2>
            <p style={{ fontSize: T.body, color: C.muted }}>
              Um preço por loja, sem surpresa.
            </p>
          </div>

          <PriceCalculator />

          {/* O ZCheck se paga — os 3 ralos */}
          <div style={{ maxWidth: 860, margin: '56px auto 0' }}>
            <h3 style={{ textAlign: 'center', fontSize: T.label, fontWeight: W.semibold, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, marginBottom: 20 }}>
              O ZCheck se paga
            </h3>
            <div className="lp-grid-3">
              {[
                { Icon: Trash2, t: 'Menos perdas', d: 'Validade, temperatura e estoque sob controle.' },
                // Sem citar norma de um setor só (a RDC 216 é de food service):
                // o público agora inclui farmácia, consultório e escritório.
                { Icon: ShieldCheck, t: 'Fiscalização sem susto', d: 'Cada rotina fica registrada com hora, responsável e, quando você quiser, foto.' },
                { Icon: ArrowLeftRight, t: 'Padrão entre turnos', d: 'Quem chega no turno seguinte vê o checklist do anterior atrasado ou parcial, sem depender do WhatsApp.' },
              ].map(({ Icon, t, d }) => (
                <div key={t} style={{ textAlign: 'center', padding: '8px 12px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: R.md, background: C.bg, marginBottom: 10 }}>
                    <Icon size={20} color={C.ink} aria-hidden />
                  </span>
                  <h4 style={{ fontSize: T.body, fontWeight: W.semibold, color: C.ink }}>{t}</h4>
                  <p style={{ fontSize: T.bodySm, color: C.muted, marginTop: 4, lineHeight: 1.55 }}>{d}</p>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div style={{ textAlign: 'center', marginTop: 48 }}>
            <a href={SIGNUP} className="lp-btn lp-btn-primary" style={{ padding: '15px 32px', fontSize: T.bodyLg }}>
              Teste grátis por {TRIAL_DAYS} dias, sem cartão de crédito
            </a>
            <p style={{ fontSize: T.caption, color: C.muted, marginTop: 12 }}>
              {FRANQUIA} usuários inclusos por loja · vaga adicional {VAGA}/mês · Anual: 12 meses no cartão · Mensal: sem fidelidade, cancele quando quiser.
            </p>
          </div>

          {/* A premissa — transparência. Mora aqui, no preço, que é onde ela se
              prova: logo abaixo vêm os compromissos e o mercado × ZCheck. */}
          <div style={{ maxWidth: 680, margin: '72px auto 0' }}>
            <Eyebrow color={C.success}>Nossa premissa</Eyebrow>
            <h3 style={{ fontSize: 'clamp(22px, 2.8vw, 30px)', fontWeight: W.bold, lineHeight: 1.25, marginBottom: 14 }}>
              Todos os custos do ZCheck estão escritos nesta página.
            </h3>
            <p style={{ fontSize: T.body, color: C.muted, lineHeight: 1.8 }}>
              Na maioria dos softwares de operação, o preço só aparece depois de uma
              conversa com um consultor. No ZCheck, o preço é público, a calculadora faz a conta em
              segundos e até o custo de sair do anual antes do prazo está aqui. Se a nossa
              proposta é mostrar o que acontece na sua operação, não faz sentido esconder quanto custa.
            </p>
          </div>

          {/* Compromissos públicos */}
          <div style={{ maxWidth: 680, margin: '28px auto 0', border: `1.5px solid ${C.border}`, borderRadius: R.lg, padding: 28 }}>
            <h3 style={{ fontSize: T.bodyLg, fontWeight: W.bold, marginBottom: 16 }}>Compromissos públicos</h3>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                // Não "desde o primeiro dia": no começo (07/2026) o preço era
                // combinado com os primeiros clientes.
                'Preço público, para todo cliente. Você não pede cotação nem fala com consultor, e não existe taxa escondida.',
                'Sem taxa de implantação. No plano anual, a implantação assistida está incluída a partir de 1 loja.',
                `${FRANQUIA} usuários inclusos em cada loja. A vaga adicional custa ${VAGA}/mês, igual no anual e no mensal, e só é contratada com a sua confirmação.`,
                'Plano mensal sem fidelidade e sem multa. Você cancela quando quiser, e o plano segue valendo até o fim do mês já pago.',
                // Termos v1.2, seção 7 — o único custo que antes morava só lá.
                `Plano anual de 12 meses. Se sair antes, você paga só a diferença para o mensal (${SAIDA_ANUAL} por loja em cada mês usado), sem multa.`,
              ].map(item => (
                <li key={item} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <Check size={16} color={C.success} aria-hidden style={{ flexShrink: 0, marginTop: 3 }} />
                  <span style={{ fontSize: T.bodySm, color: C.ink, lineHeight: 1.6 }}>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Como o mercado faz × como o ZCheck faz */}
          <div style={{ maxWidth: 680, margin: '32px auto 0' }}>
            <h3 style={{ fontSize: T.bodyLg, fontWeight: W.bold, marginBottom: 16, textAlign: 'center' }}>
              Como o mercado faz · Como o ZCheck faz
            </h3>
            <div style={{ border: `1px solid ${C.border}`, borderRadius: R.md, overflow: 'hidden' }}>
              {[
                ['“Peça uma cotação.”', 'O preço é público.'],
                ['“Fale com um consultor.”', 'Comece o teste agora.'],
                ['Fidelidade na letra miúda.', `Mensal sem fidelidade. O anual é de 12 meses, e sair antes custa ${SAIDA_ANUAL}/loja por mês usado.`],
                ['Taxa de implantação escondida.', 'Sem taxa.'],
              ].map(([mercado, zcheck], i) => (
                <div key={mercado} style={{ display: 'flex', flexWrap: 'wrap', borderTop: i === 0 ? 'none' : `1px solid ${C.border}` }}>
                  <p style={{ flex: '1 1 220px', padding: '13px 16px', fontSize: T.bodySm, color: C.muted, background: C.bg }}>{mercado}</p>
                  <p style={{ flex: '1 1 220px', padding: '13px 16px', fontSize: T.bodySm, color: C.ink, fontWeight: W.semibold }}>{zcheck}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 9 · FAQ — uma lista só. Havia duas (preço e geral) com "Funciona sem
          internet?" repetida. As perguntas de usuário existem porque a franquia
          é SOMADA na empresa (não "10 por loja, cada uma no seu quadrado") e
          porque a fatura segue a vaga CONTRATADA, não o uso — quem suspende
          alguém esperando pagar menos precisa saber antes. */}
      <section style={{ padding: '72px 0', borderTop: `1px solid ${C.border}` }}>
        <div className="lp-container" style={{ maxWidth: 680 }}>
          {/* h2 visível (P9 da revisão): a seção era a única sem título de verdade. */}
          <h2 style={{ fontSize: 'clamp(24px, 3vw, 34px)', fontWeight: W.bold, lineHeight: 1.2, marginBottom: 24 }}>
            Perguntas frequentes
          </h2>
          <div style={{ borderTop: `1px solid ${C.border}` }}>
            {[
              ['Minha equipe vai usar?', 'Cada colaborador entra com um PIN, vê só os checklists do setor dele e marca no celular em segundos. Não precisa de treinamento longo nem de app pesado. E como cada um acompanha o próprio histórico e é reconhecido pelo que faz, a equipe continua usando depois que a novidade passa.'],
              ['Quanto custa?', `Os primeiros ${TRIAL_DAYS} dias são grátis, sem cartão. Depois, você paga ${ANUAL} por loja/mês no plano anual (12 meses no cartão) ou ${MENSAL} no mensal, sem fidelidade. Cada loja inclui ${FRANQUIA} usuários, somados na empresa, e a vaga adicional custa ${VAGA}/mês nos dois planos. O preço é público e igual para qualquer segmento.`],
              ['Serve para quem tem 1 loja só?', `Sim. O preço é por loja, então com 1 loja você paga ${ANUAL}/mês no anual e já tem ${FRANQUIA} usuários inclusos. A vaga adicional sai por ${VAGA}/mês.`],
              ['O que conta como loja/unidade?', 'Cada ponto de operação com equipe própria: loja, restaurante, farmácia, consultório, escritório, quiosque ou dark kitchen.'],
              ['Quantos usuários estão incluídos?', `${FRANQUIA} por loja, somados na empresa. Com 2 lojas, por exemplo, são ${includedSeatsFor(2)} usuários, distribuídos entre elas como você quiser. Se precisar de mais gente, cada vaga adicional custa ${VAGA}/mês, no anual e no mensal, e só entra na fatura se você contratar.`],
              ['O que conta como usuário?', 'Cada pessoa com acesso ativo, da equipe à diretoria. Quem vê várias lojas ocupa uma vaga só. Suspender um acesso libera a vaga para outra pessoa, mas a fatura segue as vagas contratadas. Se sobrar vaga adicional, você reduz no app, e a mudança vale a partir da próxima fatura.'],
              ['Como funciona a cobrança do anual?', `São ${ANUAL} por loja, cobrados todo mês no cartão de crédito durante 12 meses. Se houver vagas adicionais, elas entram na mesma cobrança, a ${VAGA}/mês cada.`],
              // A saída antecipada do anual: Termos v1.2, seção 7. Mudou lá,
              // muda aqui — SAIDA_ANUAL já sai de lib/plans.js.
              ['Existe contrato de fidelidade?', `No plano mensal, não. Você cancela quando quiser, sem multa, e o cancelamento vale ao fim do mês já pago. O plano anual é um compromisso de 12 meses, cobrado mês a mês no cartão, em troca de ${DESCONTO_ANUAL} de desconto no preço da loja (${ANUAL} em vez de ${MENSAL}). Se sair antes, você paga só a diferença para o mensal (${SAIDA_ANUAL} por loja em cada mês usado), sem multa. A vaga adicional custa ${VAGA}/mês nos dois planos e não entra nessa diferença.`],
              // Sem pró-rata desde 23/09/2026: loja e vaga mudam o valor da
              // assinatura a partir da PRÓXIMA fatura (Termos v1.2, seção 7).
              ['O que acontece se eu abrir ou fechar uma loja no meio do mês?', `A cobrança acompanha as lojas ativas e muda a partir da fatura seguinte, sem cálculo proporcional aos dias. Se você abrir uma loja, ela passa a contar na próxima fatura e traz mais ${FRANQUIA} vagas de usuário. Se fechar, ela deixa de contar na fatura seguinte. As vagas adicionais seguem a mesma regra.`],
              ['Vocês aumentam o preço depois?', 'O preço é público, e se ele mudar, a mudança também será pública. No plano anual, o valor contratado fica garantido até o fim dos seus 12 meses. No mensal, um novo valor só vale a partir do ciclo seguinte, com 30 dias de aviso.'],
              ['O que é a implantação assistida?', 'Nossa equipe configura a operação junto com você: monta lojas, setores e checklists, passa para o ZCheck o que hoje está em planilha e treina os gerentes no primeiro acesso. Está incluída no plano anual para qualquer número de lojas, inclusive uma só. No plano mensal, você mesmo faz a implantação, com os modelos prontos da biblioteca e um passo a passo dentro do app, também sem custo.'],
              ['Precisa instalar alguma coisa?', 'Não. O ZCheck roda no navegador e pode ser adicionado à tela inicial do celular como um app (PWA). Você não precisa baixar nada na loja de aplicativos, e ele se atualiza sozinho.'],
              ['Funciona sem internet?', 'Sim. O que a equipe marca fica salvo no aparelho e sincroniza quando a conexão volta. Dá para usar no estoque, na câmara fria ou no subsolo, onde o sinal costuma falhar. Entrar com o PIN precisa de internet; depois, a sessão fica guardada no aparelho por até 7 dias sem conexão. Em celular compartilhado, troque de usuário onde houver sinal.'],
              ['Quanto tempo até começar a usar?', 'Poucos minutos. Você cria a conta, escolhe um modelo ou monta o seu e já começa o teste, sem esperar aprovação da nossa equipe.'],
              // Sem "isolados por empresa": as fotos e os POPs ficam num bucket
              // que a chave pública alcança sem filtro de empresa (lib/sync.js,
              // migration 20260731_storage_checklist_photos). Só volta a dizer
              // isolamento quando o storage passar para o cliente autenticado,
              // com company_id no caminho e policy por empresa.
              ['Como ficam os meus dados?', 'Tratamos os seus dados conforme a LGPD. Como coletamos, guardamos e protegemos cada informação está nos Termos de Uso e na Política de Privacidade, no rodapé.'],
            ].map(([q, a]) => (
              <details key={q} className="lp-faq" style={{ borderBottom: `1px solid ${C.border}` }}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* 10 · ECO + CTA — a transparência do preço e a da operação são a mesma
          promessa. Fecha a página, depois das dúvidas respondidas. */}
      {/* zc-on-dark: o anel de foco vira greenOnDark (6.66:1). Sem a classe ele
          saía na cor do ink — o mesmo fundo, 1:1, invisível no Tab. */}
      <section className="zc-on-dark" style={{ background: C.ink, color: 'white', padding: '96px 0', textAlign: 'center' }}>
        <div className="lp-container" style={{ maxWidth: 660 }}>
          <h2 style={{ fontSize: 'clamp(26px, 3.4vw, 40px)', fontWeight: W.bold, marginBottom: 14 }}>
            Comece hoje e configure em minutos.
          </h2>
          <p style={{ fontSize: T.body, opacity: 0.8, lineHeight: 1.7, marginBottom: 32 }}>
            Crie a conta e use o ZCheck com a sua equipe por {TRIAL_DAYS} dias, de graça.
            Se gostar, é só assinar, e no mensal não tem fidelidade.
          </p>
          {/* C.success (não successBright) com texto branco: 5.02:1, passa AA. */}
          <a href={SIGNUP} className="lp-btn" style={{ background: C.success, color: 'white', padding: '15px 34px', fontSize: T.bodyLg, fontWeight: W.semibold }}>
            Criar minha conta
          </a>
          <p style={{ fontSize: T.caption, opacity: 0.6, marginTop: 14 }}>{TRIAL_DAYS} dias grátis · sem cartão para começar.</p>
        </div>
      </section>

      </main>

      {/* FOOTER */}
      {/* Borda no topo: depois da reordenação o CTA final (também escuro) vinha
          colado no rodapé, sem divisa nenhuma. */}
      <footer className="zc-on-dark" style={{ background: C.ink, padding: '28px 0', borderTop: '1px solid rgba(255,255,255,0.12)' }}>
        <div className="lp-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <Image src={logo} alt="ZCheck" width={104} height={26} style={{ height: 26, width: 'auto', filter: 'brightness(0) invert(1)', opacity: 0.85 }} />
          <span style={{ fontSize: T.label, color: 'rgba(255,255,255,0.7)' }}>© 2026 ZCheck. Todos os direitos reservados. CNPJ 34.164.735/0001-72</span>
          <nav style={{ display: 'flex', flexWrap: 'wrap', columnGap: 18, rowGap: 8 }} aria-label="Links legais">
            {[['Termos', '/termos'], ['Privacidade', '/privacidade'], ['Ajuda', '/ajuda'], ['Entrar', '/entrar'], ['Contato', WA]].map(([l, h]) => (
              <a key={l} href={h} style={{ fontSize: T.label, color: 'rgba(255,255,255,0.65)', textDecoration: 'none', fontWeight: W.medium }}>{l}</a>
            ))}
          </nav>
        </div>
      </footer>

      <BackToTop />
    </div>
  );
}
