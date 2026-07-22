import {
  CheckSquare, Bell, Camera, WifiOff, Wifi, EyeOff, MessagesSquare, RotateCcw,
  AlertTriangle, Clock, Check, Eye, MapPin, Target, TrendingUp, Award,
  Trash2, ShieldCheck, Store, Pill, Dumbbell, BedDouble, Stethoscope,
} from 'lucide-react';
import { C, R, W, T, greenOnDark } from '../lib/tokens';
import BackToTop from '../components/BackToTop';
import PriceCalculator from '../components/PriceCalculator';
import { TRIAL_DAYS, PRICE_PER_UNIT } from '../lib/plans';

// Landing pública. Consome os mesmos tokens do app (lib/tokens.js). O CTA é o
// cadastro self-service (/comecar): a empresa cria a conta sozinha, testa 14 dias
// e assina — o fluxo existe (signup + trial + Mercado Pago). Os preços vêm de
// lib/plans.js (fonte única): faixas por loja com desconto progressivo, e a
// TRANSPARÊNCIA (preço público + calculadora, sem reunião comercial) é a
// premissa de posicionamento — o mercado esconde preço; o ZCheck publica.
// O hero mostra um EXEMPLO ILUSTRATIVO do briefing, rotulado — nunca dados
// falsos apresentados como reais.

const WA = 'https://wa.me/5512988017472?text=Ol%C3%A1%2C%20gostaria%20de%20saber%20mais%20sobre%20o%20ZCheck!';
const SIGNUP = '/comecar';

// h2 para leitor de tela onde o layout não pede um título visível — conserta a
// hierarquia de headings sem alterar o visual.
const srOnly = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 };

const Eyebrow = ({ color = C.muted, children }) => (
  <p style={{ fontSize: T.label, fontWeight: W.semibold, letterSpacing: '0.12em', textTransform: 'uppercase', color, marginBottom: 14 }}>
    {children}
  </p>
);

function BriefingExample() {
  return (
    <div aria-label="Exemplo ilustrativo do briefing diário">
      <p style={{ fontSize: T.label, fontWeight: W.semibold, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, marginBottom: 8, textAlign: 'center' }}>
        Exemplo ilustrativo do briefing
      </p>
      <div style={{ background: 'white', borderRadius: R.lg, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
        <div style={{ background: C.ink, color: 'white', padding: '16px 18px' }}>
          <p style={{ fontSize: T.label, fontWeight: W.semibold, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.8 }}>Briefing do dia</p>
          <p style={{ fontSize: T.h3, fontWeight: W.semibold, marginTop: 4 }}>Bom dia, Ana</p>
        </div>
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ border: `1px solid ${C.border}`, borderLeft: `4px solid ${C.warning}`, borderRadius: R.sm, padding: '10px 12px' }}>
            <p style={{ fontSize: T.label, fontWeight: W.semibold, color: C.warning, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Você marcou para tratar</p>
            <p style={{ fontSize: T.bodySm, color: C.ink, lineHeight: 1.5 }}>Conferir validade dos insumos abertos — ontem</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: T.label, fontWeight: W.semibold, color: 'white', background: C.success, borderRadius: R.sm, padding: '4px 10px' }}><Check size={12} aria-hidden /> Resolvido</span>
              <span style={{ fontSize: T.label, fontWeight: W.semibold, color: C.muted, border: `1px solid ${C.border}`, borderRadius: R.sm, padding: '4px 10px' }}>Ainda não</span>
            </div>
          </div>
          <div>
            <p style={{ fontSize: T.label, fontWeight: W.semibold, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Prioridades de hoje</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', border: `1px solid ${C.border}`, borderRadius: R.sm, padding: '10px 12px' }}>
                <AlertTriangle size={15} color={C.critical} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden />
                <p style={{ fontSize: T.bodySm, color: C.ink, lineHeight: 1.5 }}>Loja 2: “temperatura da câmara fria” ficou pendente 2× esta semana. Priorize hoje.</p>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', border: `1px solid ${C.border}`, borderRadius: R.sm, padding: '10px 12px' }}>
                <Clock size={15} color={C.warning} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden />
                <p style={{ fontSize: T.bodySm, color: C.ink, lineHeight: 1.5 }}>“Fechamento — Caixa” está atrasado na Loja 1.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Mockups de uso do app (notebook = gestão, celular = execução), em CSS puro
// com os tokens do site — sem screenshot real e sem imagem de banco. Sempre
// rotulados como exemplo ilustrativo, como o briefing do hero.
function AppShowcase() {
  const statCard = { background: 'white', border: `1px solid ${C.border}`, borderRadius: R.sm, padding: '8px 12px', flex: 1, minWidth: 0 };
  const checkRow = (done) => ({ display: 'flex', gap: 8, alignItems: 'center', padding: '7px 10px', borderRadius: R.sm, border: `1px solid ${C.border}`, background: done ? '#F4FAF6' : 'white' });
  const checkDot = (done) => ({ flexShrink: 0, width: 17, height: 17, borderRadius: R.pill, display: 'flex', alignItems: 'center', justifyContent: 'center', background: done ? C.success : 'white', border: done ? 'none' : `1.5px solid ${C.borderStrong}` });
  const lojaRow = (nome, pct, cor) => (
    <div key={nome} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'white', border: `1px solid ${C.border}`, borderRadius: R.sm, padding: '7px 11px' }}>
      <p style={{ fontSize: T.label, fontWeight: W.semibold, color: C.ink, width: 44, flexShrink: 0 }}>{nome}</p>
      <div style={{ flex: 1, height: 5, background: C.border, borderRadius: R.pill, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: cor }} aria-hidden />
      </div>
      <p style={{ fontSize: T.label, fontWeight: W.bold, color: cor, width: 34, textAlign: 'right', flexShrink: 0 }}>{pct}%</p>
    </div>
  );
  return (
    <div style={{ marginTop: 64 }} aria-label="Exemplo ilustrativo do app no notebook e no celular">
      {/* Rótulo alinhado ao notebook (esquerda): o celular sobreposto ocupa a
          direita e não pode cobrir o texto. */}
      <div className="lp-showcase" style={{ marginBottom: 12 }}>
        <p style={{ fontSize: T.label, fontWeight: W.semibold, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, maxWidth: 560 }}>
          Exemplo ilustrativo — a gestão no notebook, a equipe no celular
        </p>
      </div>
      <div className="lp-showcase">
        {/* Notebook: moldura escura (lid) com webcam, tela 16:10, deck
            trapezoidal com scoop e sombra de chão — spec da revisão de design.
            A gestão vê a REDE (multi-loja); o checklist individual é do celular. */}
        <div className="lp-showcase-laptop">
          <div className="lap-lid">
            <div className="lap-screen">
              <div style={{ background: C.ink, padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <span style={{ width: 8, height: 8, borderRadius: R.pill, background: '#E8695A' }} aria-hidden />
                <span style={{ width: 8, height: 8, borderRadius: R.pill, background: '#E5B23C' }} aria-hidden />
                <span style={{ width: 8, height: 8, borderRadius: R.pill, background: '#57A464' }} aria-hidden />
                <span style={{ marginLeft: 8, fontSize: 10.5, color: 'rgba(255,255,255,0.65)', background: 'rgba(255,255,255,0.1)', borderRadius: R.pill, padding: '2px 12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  suaempresa.zcheckapp.com/app
                </span>
              </div>
              <div style={{ flex: 1, minHeight: 0, padding: '13px 16px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, paddingRight: 56 }}>
                  <p style={{ fontSize: T.body, fontWeight: W.bold, color: C.ink }}>Briefing do dia</p>
                  <p style={{ fontSize: T.label, fontWeight: W.semibold, color: C.muted }}>3 lojas · hoje</p>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={statCard}>
                    <p style={{ fontSize: T.label, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted }}>Execução ontem</p>
                    <p style={{ fontSize: 21, fontWeight: W.bold, color: C.success }}>92%</p>
                  </div>
                  <div style={statCard}>
                    <p style={{ fontSize: T.label, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted }}>Pendências</p>
                    <p style={{ fontSize: 21, fontWeight: W.bold, color: C.warning }}>3</p>
                  </div>
                  <div style={statCard}>
                    <p style={{ fontSize: T.label, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted }}>Críticos</p>
                    <p style={{ fontSize: 21, fontWeight: W.bold, color: C.critical }}>1</p>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {lojaRow('Loja 1', 96, C.success)}
                  {lojaRow('Loja 2', 78, C.warning)}
                  {lojaRow('Loja 3', 91, C.success)}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: 'white', border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.critical}`, borderRadius: R.sm, padding: '8px 11px' }}>
                  <AlertTriangle size={13} color={C.critical} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden />
                  <p style={{ fontSize: T.label, color: C.ink, lineHeight: 1.45 }}>Loja 2: “câmara fria” pendente 2× esta semana — priorize hoje.</p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: 'white', border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.warning}`, borderRadius: R.sm, padding: '8px 11px' }}>
                  <Clock size={13} color={C.warning} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden />
                  <p style={{ fontSize: T.label, color: C.ink, lineHeight: 1.45 }}>“Fechamento — Caixa” atrasado na Loja 1.</p>
                </div>
              </div>
            </div>
          </div>
          <div className="lap-deck" aria-hidden />
        </div>

        {/* Celular: frame escuro fino com botões laterais, tela 9:19,5 com ilha
            de câmera, status bar e home indicator. */}
        <div className="lp-showcase-phone">
          <div className="phone-frame">
            <span className="phone-vol" style={{ top: 92 }} aria-hidden />
            <span className="phone-vol" style={{ top: 130 }} aria-hidden />
            <div className="phone-screen">
              <span className="phone-island" aria-hidden />
              <div style={{ height: 27, padding: '0 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <span style={{ fontSize: 10, fontWeight: W.semibold, color: C.ink }}>9:41</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Wifi size={10} color={C.ink} aria-hidden />
                  <span style={{ width: 16, height: 8, border: `1px solid ${C.borderStrong}`, borderRadius: 2, padding: 1, display: 'inline-flex' }} aria-hidden>
                    <span style={{ width: '70%', height: '100%', background: C.ink, borderRadius: 1 }} />
                  </span>
                </span>
              </div>
              <div style={{ flex: 1, minHeight: 0, padding: '5px 10px 0', display: 'flex', flexDirection: 'column' }}>
                <p style={{ fontSize: T.label, fontWeight: W.semibold, color: C.muted }}>Loja 1 · 07:42</p>
                <p style={{ fontSize: T.bodySm, fontWeight: W.bold, color: C.ink, marginTop: 1 }}>Abertura — Cozinha</p>
                <div style={{ height: 5, background: C.border, borderRadius: R.pill, margin: '8px 0 4px', overflow: 'hidden' }}>
                  <div style={{ width: '75%', height: '100%', background: C.success }} aria-hidden />
                </div>
                <p style={{ fontSize: T.label, color: C.muted, marginBottom: 8 }}>6 de 8 itens</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={checkRow(true)}>
                    <span style={checkDot(true)}><Check size={10} color="white" aria-hidden /></span>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: T.label, fontWeight: W.semibold, color: C.ink }}>Temperatura da câmara fria</p>
                      <p style={{ fontSize: 10, fontWeight: W.semibold, color: C.success, display: 'flex', alignItems: 'center', gap: 3 }}><Camera size={10} aria-hidden /> Foto anexada</p>
                    </div>
                  </div>
                  <div style={checkRow(true)}>
                    <span style={checkDot(true)}><Check size={10} color="white" aria-hidden /></span>
                    <p style={{ fontSize: T.label, fontWeight: W.semibold, color: C.ink }}>Bancadas higienizadas</p>
                  </div>
                  <div style={checkRow(false)}>
                    <span style={checkDot(false)} />
                    <p style={{ fontSize: T.label, fontWeight: W.medium, color: C.muted }}>Validade dos insumos abertos</p>
                  </div>
                </div>
                <div style={{ marginTop: 'auto', marginBottom: 10, background: C.ink, color: 'white', borderRadius: R.sm, padding: '10px 0', textAlign: 'center', fontSize: T.label, fontWeight: W.bold }}>
                  Concluir checklist
                </div>
              </div>
              <div style={{ width: 70, height: 4, borderRadius: R.pill, background: 'rgba(6,60,92,0.30)', margin: '0 auto 5px', flexShrink: 0 }} aria-hidden />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Segmentos secundários da faixa "Feito para o seu negócio" (o público
// principal — bares, restaurantes, lanchonetes e padarias — é o alvo da
// headline de preço). `href` fica reservado para as futuras landings por
// segmento; enquanto null, o card não é link.
const SEGMENTS = [
  { id: 'franquias', Icon: Store,       nome: 'Franquias',         frase: 'Padrão de marca auditável em todas as unidades.', href: null },
  { id: 'farmacias', Icon: Pill,        nome: 'Farmácias',         frase: 'Autoinspeção e registros da Anvisa, sem papel.',  href: null },
  { id: 'academias', Icon: Dumbbell,    nome: 'Academias',         frase: 'Equipamentos revisados e limpeza em dia.',        href: null },
  { id: 'hoteis',    Icon: BedDouble,   nome: 'Hotéis e Pousadas', frase: 'Governança conferida quarto a quarto.',           href: null },
  { id: 'clinicas',  Icon: Stethoscope, nome: 'Clínicas',          frase: 'Biossegurança documentada com foto e hora.',      href: null },
];

// Os cinco pilares — a narrativa de posicionamento.
const PILLARS = [
  { Icon: Eye, title: 'Você enxerga a operação inteira',
    text: 'Um briefing por dia com o que caiu, o que atrasou e o que priorizar. Sem garimpar planilha nem rolar o grupo do WhatsApp.' },
  { Icon: MapPin, title: 'Acompanhe de qualquer lugar',
    text: 'Uma loja ou cinco: você não precisa estar presente para saber como cada unidade abriu, rodou e fechou.' },
  { Icon: Target, title: 'Aja no que importa',
    text: 'As prioridades sobem sozinhas quando um item crítico falha mais de uma vez. E o ZCheck só interrompe quando há sinal real — dia tranquilo não vira barulho.' },
  { Icon: TrendingUp, title: 'Constrói cultura de execução',
    text: 'Consistência na execução constrói cultura, e cultura mantém o padrão mesmo quando você não está.' },
  { Icon: Award, title: 'Reconhece quem faz acontecer',
    text: 'Cada pessoa tem seu ID operacional e é reconhecida pela consistência. Quem sustenta o padrão aparece — não fica invisível.' },
];

export default function LandingPage() {
  return (
    // overflow-x: clip (não hidden): hidden quebra o position:sticky do header —
    // o Chrome trata o ancestral como scroll container e o header deixa de grudar.
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", color: C.ink, background: 'white', overflowX: 'clip' }}>
      <style>{`
        html { scroll-behavior: smooth; }
        .lp-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; text-decoration: none; border-radius: ${R.md}px; font-weight: ${W.semibold}; cursor: pointer; }
        .lp-btn-primary { background: ${C.ink}; color: #fff; padding: 14px 28px; font-size: ${T.body}px; border: none; }
        .lp-btn-primary:hover { background: ${C.inkHover}; }
        .lp-nav-links { transition: color .15s; }
        .lp-nav-links:hover { color: ${C.ink}; }
        .lp-btn-ghost { background: transparent; color: ${C.ink}; padding: 14px 24px; font-size: ${T.body}px; border: 1.5px solid ${C.borderStrong}; }
        .lp-container { max-width: 1120px; margin: 0 auto; padding-left: 40px; padding-right: 40px; }
        .lp-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 56px; align-items: center; }
        .lp-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        .lp-grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
        .lp-grid-5 { display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px; }
        details.lp-faq summary { cursor: pointer; font-size: ${T.body}px; font-weight: ${W.semibold}; color: ${C.ink}; padding: 16px 0; list-style: none; display: flex; justify-content: space-between; align-items: center; }
        details.lp-faq summary::after { content: '+'; font-size: 20px; color: ${C.muted}; }
        details.lp-faq[open] summary::after { content: '–'; }
        details.lp-faq p { font-size: ${T.bodySm}px; color: ${C.muted}; line-height: 1.7; padding-bottom: 16px; }
        details.lp-faq summary::-webkit-details-marker { display: none; }
        section[id] { scroll-margin-top: 68px; } /* altura exata do header sticky */
        /* Vitrine notebook + celular — hardware em CSS (spec da revisão de design):
           proporções reais (tela 16:10 / celular 9:19,5), bezel escuro, deck
           trapezoidal e sombras em camadas com luz vinda de cima. */
        .lp-showcase { position: relative; max-width: 860px; margin: 0 auto; padding: 0 26px; }
        .lp-showcase-laptop { max-width: 640px; position: relative; }
        .lp-showcase-laptop::after { content: ''; position: absolute; left: 8%; right: 8%; bottom: -22px; height: 18px;
          background: radial-gradient(50% 100% at 50% 0%, rgba(8,20,30,0.18), transparent 70%); filter: blur(6px); z-index: -1; }
        .lap-lid { position: relative; background: linear-gradient(180deg, #1B2A38 0%, #0C1926 55%, #0A1622 100%);
          border-radius: 18px 18px 0 0; padding: 14px 12px 12px;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 24px 48px -20px rgba(8,20,30,0.35); }
        .lap-lid::before { content: ''; position: absolute; top: 5px; left: 50%; transform: translateX(-50%);
          width: 4px; height: 4px; border-radius: 999px; background: #223441; box-shadow: 0 0 0 1.5px #0A1622; }
        .lap-screen { aspect-ratio: 16 / 10; border-radius: 4px; overflow: hidden; background: ${C.bg};
          display: flex; flex-direction: column; }
        .lap-deck { position: relative; height: 16px; margin: 0 -34px;
          background: linear-gradient(180deg, #E9EEF3 0%, #D4DCE3 55%, #B9C4CE 100%);
          border-top: 1px solid #F4F7FA; border-radius: 2px 2px 12px 12px;
          clip-path: polygon(0 0, 100% 0, 98.5% 100%, 1.5% 100%);
          box-shadow: 0 12px 24px -8px rgba(8,20,30,0.28); }
        .lap-deck::before { content: ''; position: absolute; top: 0; left: 50%; transform: translateX(-50%);
          width: 104px; height: 7px; background: radial-gradient(ellipse at 50% 0%, #AEBAC5, #CBD4DC 70%);
          border-radius: 0 0 10px 10px; }
        .lp-showcase-phone { position: absolute; right: 10px; bottom: -30px; width: 192px; }
        .phone-frame { position: relative; background: #0D1B27; border-radius: 34px; padding: 8px;
          box-shadow: inset 0 0 0 1.5px rgba(255,255,255,0.07), 0 2px 8px rgba(8,20,30,0.22), 0 28px 56px -12px rgba(8,20,30,0.35); }
        .phone-frame::before { content: ''; position: absolute; right: -2.5px; top: 108px; width: 3px; height: 52px;
          background: #0D1B27; border-radius: 0 3px 3px 0; }
        .phone-vol { position: absolute; left: -2.5px; width: 3px; height: 30px; background: #0D1B27; border-radius: 3px 0 0 3px; }
        .phone-screen { position: relative; aspect-ratio: 9 / 19.5; border-radius: 26px; overflow: hidden;
          background: ${C.bg}; display: flex; flex-direction: column; }
        .phone-island { position: absolute; top: 6px; left: 50%; transform: translateX(-50%);
          width: 58px; height: 17px; border-radius: 999px; background: #0A121C; }
        @media (max-width: 820px) {
          .lp-showcase { padding: 0; }
          .lp-showcase-laptop { max-width: none; }
          .lap-deck { margin: 0; } /* sem margem negativa: no mobile não há padding a compensar */
          .lp-showcase-phone { position: static; width: 232px; margin: 26px auto 0; }
        }
        @media (max-width: 820px) {
          .lp-container { padding-left: 20px; padding-right: 20px; }
          .lp-grid-2, .lp-grid-3, .lp-grid-4, .lp-grid-5 { grid-template-columns: 1fr; }
          .lp-nav-links { display: none; }
          .lp-hero-ctas { flex-direction: column; align-items: stretch; }
        }
      `}</style>

      {/* HEADER */}
      <header style={{ background: 'white', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, zIndex: 100 }}>
        <div className="lp-container" style={{ height: 68, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <a href="/" aria-label="ZCheck — página inicial" style={{ display: 'flex', alignItems: 'center' }}>
            <img src="/zcheck-logo.png" alt="ZCheck" width={128} height={32} style={{ height: 32, width: 'auto' }} />
          </a>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 28 }} aria-label="Navegação principal">
            <a className="lp-nav-links" href="#por-que" style={{ fontSize: T.bodySm, fontWeight: W.medium, color: C.muted, textDecoration: 'none' }}>Por que ZCheck</a>
            <a className="lp-nav-links" href="#como-funciona" style={{ fontSize: T.bodySm, fontWeight: W.medium, color: C.muted, textDecoration: 'none' }}>Como funciona</a>
            <a className="lp-nav-links" href="#preco" style={{ fontSize: T.bodySm, fontWeight: W.medium, color: C.muted, textDecoration: 'none' }}>Preço</a>
            <a className="lp-nav-links" href="/entrar" style={{ fontSize: T.bodySm, fontWeight: W.medium, color: C.muted, textDecoration: 'none' }}>Entrar</a>
            <a href={SIGNUP} className="lp-btn lp-btn-primary" style={{ padding: '10px 20px', fontSize: T.bodySm }}>Começar grátis</a>
          </nav>
        </div>
      </header>

      {/* 1 · HERO */}
      <section style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
        <div className="lp-container lp-grid-2" style={{ paddingTop: 72, paddingBottom: 72 }}>
          <div>
            <Eyebrow color={C.success}>Do checklist à cultura de execução</Eyebrow>
            <h1 style={{ fontSize: 'clamp(32px, 4.5vw, 52px)', fontWeight: W.bold, lineHeight: 1.12, letterSpacing: '-0.02em', marginBottom: 20 }}>
              Saiba onde sua operação precisa de atenção — antes que vire problema.
            </h1>
            <p style={{ fontSize: T.bodyLg, color: C.muted, lineHeight: 1.7, maxWidth: 460, marginBottom: 32 }}>
              Sua equipe executa os checklists pelo celular. Você acompanha de onde
              estiver — e todo dia recebe um briefing com o que caiu, onde, e o que priorizar.
            </p>
            <div className="lp-hero-ctas" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
              <a href={SIGNUP} className="lp-btn lp-btn-primary">Começar teste grátis</a>
              <a href="#como-funciona" className="lp-btn lp-btn-ghost">Ver como funciona</a>
            </div>
            <p style={{ fontSize: T.caption, color: C.muted }}>
              {TRIAL_DAYS} dias grátis · sem cartão para começar · cancele quando quiser
            </p>
          </div>
          <BriefingExample />
        </div>
      </section>

      {/* 1.5 · MANIFESTO — transparência como premissa */}
      <section style={{ padding: '56px 0', borderBottom: `1px solid ${C.border}` }}>
        <div className="lp-container" style={{ maxWidth: 640 }}>
          <Eyebrow color={C.success}>Nossa premissa</Eyebrow>
          <h2 style={{ fontSize: 'clamp(22px, 2.8vw, 30px)', fontWeight: W.bold, lineHeight: 1.25, marginBottom: 16 }}>
            Transparência não é um recurso. É o nosso ponto de partida.
          </h2>
          <p style={{ fontSize: T.bodyLg, color: C.muted, lineHeight: 1.8 }}>
            No mercado de software operacional, preço é segredo e proposta é reunião:
            &ldquo;fale com um consultor&rdquo;. O ZCheck nasceu do outro lado. Nosso preço é
            público, a conta se calcula em 10 segundos, não há fidelidade escondida
            nem taxa surpresa. Uma empresa que vende visibilidade da operação dos
            outros precisa começar sendo visível na própria conta.
          </p>
        </div>
      </section>

      {/* 2 · O PROBLEMA */}
      <section style={{ padding: '72px 0' }}>
        <div className="lp-container">
          <div style={{ maxWidth: 620, marginBottom: 40 }}>
            <Eyebrow>O problema</Eyebrow>
            <h2 style={{ fontSize: 'clamp(24px, 3vw, 34px)', fontWeight: W.bold, lineHeight: 1.2 }}>
              Você só descobre o problema quando já virou prejuízo.
            </h2>
          </div>
          <div className="lp-grid-3">
            {[
              { Icon: EyeOff, title: 'O desvio aparece tarde', text: 'Papel e planilha registram, mas não avisam. A câmara fria que falhou na terça vira perda na sexta.' },
              { Icon: MessagesSquare, title: 'O WhatsApp engole a rotina', text: 'A cobrança vira mensagem perdida no grupo. Ninguém sabe o que foi feito, nem quando, nem por quem.' },
              { Icon: RotateCcw, title: 'Retrabalho sem dono', text: 'Sem evidência, a mesma tarefa é refeita — ou ninguém a faz. E a gestão só enxerga o resultado no fim do mês.' },
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

      {/* 3 · OS CINCO PILARES — título fixo à esquerda, lista à direita: em
          desktop a seção usa a largura toda em vez de deixar 300px vazios. */}
      <section id="por-que" style={{ background: C.ink, color: 'white', padding: '96px 0' }}>
        <div className="lp-container lp-grid-2" style={{ alignItems: 'flex-start', gap: 48 }}>
          <div>
            <Eyebrow color={greenOnDark}>Por que ZCheck</Eyebrow>
            <h2 style={{ fontSize: 'clamp(28px, 3.4vw, 40px)', fontWeight: W.bold, lineHeight: 1.18, marginBottom: 16 }}>
              Cinco coisas que um checklist comum não te dá.
            </h2>
            <p style={{ fontSize: T.body, opacity: 0.75, lineHeight: 1.7, maxWidth: 420 }}>
              Checklist que só registra vira papel digital. O ZCheck transforma a
              execução em visibilidade, prioridade e cultura — todo dia.
            </p>
          </div>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {PILLARS.map(({ Icon, title, text }) => (
              <li key={title} style={{ display: 'flex', gap: 16, alignItems: 'flex-start', border: '1px solid rgba(255,255,255,0.18)', borderRadius: R.md, padding: '18px 20px' }}>
                <span style={{ flexShrink: 0, width: 42, height: 42, borderRadius: R.md, background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={20} color={greenOnDark} aria-hidden />
                </span>
                <div>
                  <p style={{ fontSize: T.bodyLg, fontWeight: W.semibold, marginBottom: 4 }}>{title}</p>
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
              Da conta criada ao briefing em três passos.
            </h2>
          </div>
          <div className="lp-grid-3">
            {[
              ['Crie sua conta e adote um modelo', 'Em minutos: escolha seu setor e a biblioteca traz os checklists prontos — food service (de bar a pizzaria), hotel e varejo, com mais setores a caminho. Ajuste ao seu jeito.'],
              ['A equipe executa pelo celular', 'Cada colaborador entra com um PIN e vê só o que é do seu turno e setor. Foto onde importa, e funciona sem internet.'],
              ['Você recebe o briefing e age', 'O que caiu, o que atrasou, o que priorizar. E o que você marcar para tratar volta até ser resolvido.'],
            ].map(([t, d], i) => (
              <div key={t} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: R.md, padding: 24 }}>
                <p style={{ width: 34, height: 34, borderRadius: R.pill, background: C.ink, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: W.bold, fontSize: T.body, marginBottom: 14 }}>{i + 1}</p>
                <h3 style={{ fontSize: T.body, fontWeight: W.semibold, marginBottom: 8, lineHeight: 1.4 }}>{t}</h3>
                <p style={{ fontSize: T.bodySm, color: C.muted, lineHeight: 1.65 }}>{d}</p>
              </div>
            ))}
          </div>
          <AppShowcase />
        </div>
      </section>

      {/* 5 · A EQUIPE JUNTO (ID operacional + reconhecimento) */}
      <section style={{ background: C.bg, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: '72px 0' }}>
        <div className="lp-container lp-grid-2">
          <div>
            <Eyebrow color={C.success}>A equipe junto</Eyebrow>
            <h2 style={{ fontSize: 'clamp(24px, 3vw, 34px)', fontWeight: W.bold, lineHeight: 1.2, marginBottom: 18 }}>
              Execução que a equipe vê valer a pena.
            </h2>
            <p style={{ fontSize: T.body, color: C.muted, lineHeight: 1.75, maxWidth: 460 }}>
              Cada colaborador tem um <strong style={{ color: C.ink }}>ID operacional</strong>: entra com um PIN,
              vê só o que é do seu turno e vai formando um histórico de execução. Quem
              mantém o padrão recebe <strong style={{ color: C.ink }}>reconhecimento</strong> — a consistência
              fica visível, não invisível. É assim que a rotina vira cultura.
            </p>
          </div>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              ['ID operacional por pessoa', 'Cada um tem seu acesso e seu histórico — dá para saber o que foi feito, por quem e quando.'],
              ['Reconhecimento pela consistência', 'Quem sustenta o padrão aparece. O bom trabalho deixa de ser invisível.'],
              ['Cada um vê só o seu', 'Turno e setor filtram a tela: menos ruído para a equipe, mais foco no que é dela.'],
            ].map(([t, d]) => (
              <li key={t} style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: R.md, padding: '16px 18px' }}>
                <p style={{ fontSize: T.body, fontWeight: W.semibold, color: C.ink, marginBottom: 4 }}>{t}</p>
                <p style={{ fontSize: T.bodySm, color: C.muted, lineHeight: 1.6 }}>{d}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 6 · RECURSOS */}
      <section style={{ padding: '64px 0' }}>
        <div className="lp-container">
          <h2 style={srOnly}>Recursos</h2>
          <div className="lp-grid-4">
            {[
              { Icon: CheckSquare, title: 'Checklists por loja, setor e turno', text: 'Abertura, rotina e fechamento. Cada equipe vê só o que é dela.' },
              { Icon: Bell, title: 'Briefing diário para a gestão', text: 'Prioridades e cobranças do dia, direto de quem executou.' },
              { Icon: Camera, title: 'Evidência com foto', text: 'Itens críticos podem exigir foto. Histórico completo por período, loja e setor.' },
              { Icon: WifiOff, title: 'Funciona offline', text: 'Instala como app no celular. Sem sinal, registra local e sincroniza depois.' },
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

      {/* 8 · PREÇO — preço único por loja: anual (R$ 97, herói) e mensal
          (R$ 127, âncora). Sucinto e visual: card + linha dinâmica + os 3
          ralos de dinheiro do food service + FAQ curto. */}
      <section id="preco" style={{ padding: '96px 0' }}>
        <div className="lp-container">
          <div style={{ textAlign: 'center', maxWidth: 620, margin: '0 auto 32px' }}>
            <Eyebrow>Preço</Eyebrow>
            <h2 style={{ fontSize: 'clamp(28px, 3.4vw, 40px)', fontWeight: W.bold, lineHeight: 1.18, marginBottom: 10 }}>
              Seu restaurante no padrão, com ou sem você na loja.
            </h2>
            <p style={{ fontSize: T.body, color: C.muted }}>
              Um preço único por loja. Sem pacote, sem surpresa.
            </p>
          </div>

          <PriceCalculator />

          {/* O ZCheck se paga — os 3 ralos */}
          <div style={{ maxWidth: 860, margin: '56px auto 0' }}>
            <p style={{ textAlign: 'center', fontSize: T.label, fontWeight: W.semibold, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, marginBottom: 20 }}>
              O ZCheck se paga
            </p>
            <div className="lp-grid-3">
              {[
                { Icon: Trash2, t: 'Menos perdas', d: 'Validade, temperatura e porcionamento sob controle.' },
                { Icon: ShieldCheck, t: 'Vigilância sem susto', d: 'A RDC 216 exige registros — foto, hora e responsável.' },
                { Icon: RotateCcw, t: 'Padrão entre turnos', d: 'Briefing diário sem depender do WhatsApp.' },
              ].map(({ Icon, t, d }) => (
                <div key={t} style={{ textAlign: 'center', padding: '8px 12px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: R.md, background: C.bg, marginBottom: 10 }}>
                    <Icon size={20} color={C.ink} aria-hidden />
                  </span>
                  <p style={{ fontSize: T.body, fontWeight: W.semibold, color: C.ink }}>{t}</p>
                  <p style={{ fontSize: T.bodySm, color: C.muted, marginTop: 4, lineHeight: 1.55 }}>{d}</p>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div style={{ textAlign: 'center', marginTop: 48 }}>
            <a href={SIGNUP} className="lp-btn lp-btn-primary" style={{ padding: '15px 32px', fontSize: T.bodyLg }}>
              Teste grátis por {TRIAL_DAYS} dias — sem cartão de crédito
            </a>
            <p style={{ fontSize: T.caption, color: C.muted, marginTop: 12 }}>
              Anual: 12 meses no cartão · Mensal: sem fidelidade, cancele quando quiser.
            </p>
          </div>

          {/* FAQ enxuto do preço */}
          <div style={{ maxWidth: 620, margin: '48px auto 0', borderTop: `1px solid ${C.border}` }}>
            {[
              ['O que conta como loja/unidade?', 'Cada ponto de operação com equipe própria — loja de rua, praça de alimentação, quiosque ou dark kitchen.'],
              ['Como funciona a cobrança do anual?', `R$ ${PRICE_PER_UNIT.annual} por loja, todo mês no cartão de crédito, por 12 meses.`],
              ['Funciona sem internet?', 'Sim — a equipe registra offline e tudo sincroniza quando a conexão volta.'],
              ['Serve para quem tem 1 loja só?', `Sim. O preço é por loja: 1 loja = R$ ${PRICE_PER_UNIT.annual}/mês no anual.`],
            ].map(([q, a]) => (
              <details key={q} className="lp-faq" style={{ borderBottom: `1px solid ${C.border}` }}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>

          {/* Compromissos públicos */}
          <div style={{ maxWidth: 680, margin: '48px auto 0', border: `1.5px solid ${C.border}`, borderRadius: R.lg, padding: 28 }}>
            <h3 style={{ fontSize: T.bodyLg, fontWeight: W.bold, marginBottom: 16 }}>Compromissos públicos</h3>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                'Preço público, desde o primeiro dia. Sem cotação, sem consultor, sem taxa escondida.',
                'Sem taxa de implantação — e no plano anual, você ganha implantação assistida, desde 1 loja.',
                'Sem custo por usuário — usuários ilimitados em cada loja.',
                'Cancelamento em 2 cliques, sem multa, sem fidelidade no plano mensal.',
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
                ['“Peça uma cotação.”', `O preço está na página: R$ ${PRICE_PER_UNIT.annual}/loja.`],
                ['“Fale com um consultor.”', 'Comece o teste agora.'],
                ['Fidelidade na letra miúda.', 'Mensal sem fidelidade; anual claro: 12 meses.'],
                ['Taxa de implantação escondida.', 'Sem taxa. Está escrito aqui em cima.'],
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

      {/* 8.5 · SEGMENTOS — "feito para o seu negócio"; mesmo preço em todos.
          `href` de cada card fica reservado para as futuras landings por
          segmento (config no array SEGMENTS). */}
      <section id="para-quem" style={{ background: C.bg, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: '64px 0' }}>
        <div className="lp-container">
          <h2 style={{ textAlign: 'center', fontSize: 'clamp(22px, 2.6vw, 28px)', fontWeight: W.bold, marginBottom: 28 }}>
            Feito para o seu negócio
          </h2>
          <div className="lp-grid-5">
            {SEGMENTS.map(({ id, Icon, nome, frase, href }) => {
              const Tag = href ? 'a' : 'div';
              return (
                <Tag key={id} id={`seg-${id}`} {...(href ? { href } : {})}
                  style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: R.md, padding: 20, textDecoration: 'none', display: 'block' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: R.md, background: C.bg, marginBottom: 10 }}>
                    <Icon size={18} color={C.ink} aria-hidden />
                  </span>
                  <p style={{ fontSize: T.bodySm, fontWeight: W.bold, color: C.ink, marginBottom: 4 }}>{nome}</p>
                  <p style={{ fontSize: T.caption, color: C.muted, lineHeight: 1.5 }}>{frase}</p>
                </Tag>
              );
            })}
          </div>
          <p style={{ textAlign: 'center', fontSize: T.bodySm, fontWeight: W.semibold, color: C.ink, marginTop: 24 }}>
            Qualquer segmento. Qualquer tamanho. R$ {PRICE_PER_UNIT.annual} por unidade/mês no plano anual.
          </p>
        </div>
      </section>

      {/* 9 · ECO + CTA — a transparência do preço e a da operação são a mesma promessa */}
      <section style={{ background: C.ink, color: 'white', padding: '96px 0', textAlign: 'center' }}>
        <div className="lp-container" style={{ maxWidth: 660 }}>
          <p style={{ fontSize: T.bodySm, fontWeight: W.semibold, opacity: 0.75, marginBottom: 20 }}>
            O briefing diário mostra sua operação sem filtro — o mesmo princípio do
            nosso preço: você vê tudo, todos os dias.
          </p>
          <h2 style={{ fontSize: 'clamp(26px, 3.4vw, 40px)', fontWeight: W.bold, marginBottom: 14 }}>
            Comece hoje. Configure em minutos.
          </h2>
          <p style={{ fontSize: T.body, opacity: 0.8, lineHeight: 1.7, marginBottom: 32 }}>
            Crie sua conta, escolha um modelo do seu setor e comece o teste de {TRIAL_DAYS} dias.
            Se fizer sentido, você assina — e cancela quando quiser.
          </p>
          {/* C.success (não successBright) com texto branco: 5.02:1, passa AA. */}
          <a href={SIGNUP} className="lp-btn" style={{ background: C.success, color: 'white', padding: '15px 34px', fontSize: T.bodyLg, fontWeight: W.semibold }}>
            Criar minha conta
          </a>
          <p style={{ fontSize: T.caption, opacity: 0.6, marginTop: 14 }}>{TRIAL_DAYS} dias grátis · sem cartão para começar.</p>
        </div>
      </section>

      {/* 10 · FAQ */}
      <section style={{ padding: '72px 0' }}>
        <div className="lp-container" style={{ maxWidth: 680 }}>
          {/* h2 visível (P9 da revisão): a seção era a única sem título de verdade. */}
          <h2 style={{ fontSize: 'clamp(24px, 3vw, 34px)', fontWeight: W.bold, lineHeight: 1.2, marginBottom: 24 }}>
            Perguntas frequentes
          </h2>
          <div style={{ borderTop: `1px solid ${C.border}` }}>
            {[
              ['Minha equipe vai usar?', 'Cada colaborador entra com um PIN, vê só o que é do seu turno e marca no celular em segundos — sem treinamento longo nem app pesado. Como cada um forma seu histórico e recebe reconhecimento, a adesão se sustenta.'],
              ['Quanto custa?', `${TRIAL_DAYS} dias grátis, sem cartão. Depois, R$ ${PRICE_PER_UNIT.annual} por loja/mês no plano anual (12 meses no cartão) ou R$ ${PRICE_PER_UNIT.monthly} no mensal, sem fidelidade. Preço único, público, igual para qualquer segmento.`],
              ['O que acontece se eu abrir ou fechar uma loja no meio do mês?', 'A cobrança acompanha as unidades ativas, com pró-rata: loja que entra paga proporcional aos dias do mês, loja que sai deixa de contar na fatura seguinte.'],
              ['Vocês aumentam o preço depois?', 'O preço é público, e mudanças também serão. No plano anual, o valor contratado fica garantido até o fim dos seus 12 meses. No mensal, um novo valor só vale a partir do ciclo seguinte, com 30 dias de aviso.'],
              ['Existe contrato de fidelidade?', `Não no plano mensal: cancele quando quiser, em 2 cliques, sem multa. O plano anual é um compromisso de 12 meses, cobrado mês a mês no cartão — em troca de 24% de desconto (R$ ${PRICE_PER_UNIT.annual} em vez de R$ ${PRICE_PER_UNIT.monthly} por loja).`],
              ['O que é a implantação assistida?', 'Nossa equipe configura a operação com você: lojas, setores e checklists montados juntos, migração do que hoje está em planilha e treinamento dos gerentes no primeiro acesso. Está incluída no plano anual, para qualquer número de lojas — de 1 para cima. No plano mensal, a implantação é self-service: modelos prontos por setor e onboarding guiado dentro do app, também sem custo.'],
              ['Precisa instalar alguma coisa?', 'Não. O ZCheck roda no navegador e pode ser adicionado à tela inicial do celular como um app (PWA). Sem loja de aplicativos, sem atualização manual.'],
              ['Funciona sem internet?', 'Sim. A execução registra tudo localmente e sincroniza quando a conexão volta — feito para estoque, câmara fria e subsolo.'],
              ['Quanto tempo até começar a usar?', 'Minutos. Você cria a conta, escolhe um modelo do seu setor e já começa o teste — sem esperar aprovação da nossa equipe.'],
              ['Como ficam os meus dados?', 'Isolados por empresa e tratados conforme a LGPD. Os detalhes estão nos Termos de Uso e na Política de Privacidade, no rodapé.'],
            ].map(([q, a]) => (
              <details key={q} className="lp-faq" style={{ borderBottom: `1px solid ${C.border}` }}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ background: C.ink, padding: '28px 0' }}>
        <div className="lp-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <img src="/zcheck-logo.png" alt="ZCheck" width={104} height={26} style={{ height: 26, width: 'auto', filter: 'brightness(0) invert(1)', opacity: 0.85 }} />
          <span style={{ fontSize: T.label, color: 'rgba(255,255,255,0.7)' }}>© 2026 ZCheck. Todos os direitos reservados. CNPJ 34.164.735/0001-72</span>
          <nav style={{ display: 'flex', gap: 18 }} aria-label="Links legais">
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
