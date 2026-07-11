import {
  CheckSquare, Sun, Camera, WifiOff, EyeOff, MessagesSquare, RotateCcw,
  AlertTriangle, Clock,
} from 'lucide-react';
import { C, R, W, T } from '../lib/tokens';
import { LIBRARY_VERTICALS } from '../lib/library';

// Landing pública. Consome os mesmos tokens do app (lib/tokens.js) — era uma
// das superfícies com paleta divergente. O CTA é o waitlist (/lista): não há
// self-service enquanto o isolamento multi-tenant não estiver no ar em
// produção; cada empresa é provisionada manualmente (decisão de 09/07/2026).
// O hero mostra um EXEMPLO ILUSTRATIVO do briefing, rotulado — nunca dados
// falsos apresentados como reais.

const WA = 'https://wa.me/5512988017472?text=Ol%C3%A1%2C%20gostaria%20de%20saber%20mais%20sobre%20o%20ZCheck!';

// Verde para TEXTO pequeno sobre o fundo ink: 6.66:1 (medido). O successBright
// dá só 3.52:1 nesse fundo — reprova para eyebrow de 12px.
const GREEN_ON_DARK = '#4ADE80';

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
          <p style={{ fontSize: T.label, fontWeight: W.semibold, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.8 }}>☀️ Briefing do dia</p>
          <p style={{ fontSize: T.h3, fontWeight: W.semibold, marginTop: 4 }}>Bom dia, Ana</p>
        </div>
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ border: `1px solid ${C.border}`, borderLeft: `4px solid ${C.warning}`, borderRadius: R.sm, padding: '10px 12px' }}>
            <p style={{ fontSize: T.label, fontWeight: W.semibold, color: C.warning, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Você marcou para tratar</p>
            <p style={{ fontSize: T.bodySm, color: C.ink, lineHeight: 1.5 }}>Conferir validade dos insumos abertos — ontem</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <span style={{ fontSize: T.label, fontWeight: W.semibold, color: 'white', background: C.success, borderRadius: R.sm, padding: '4px 10px' }}>✓ Resolvido</span>
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

export default function LandingPage() {
  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", color: C.ink, background: 'white', overflowX: 'hidden' }}>
      <style>{`
        .lp-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; text-decoration: none; border-radius: ${R.md}px; font-weight: ${W.semibold}; cursor: pointer; }
        .lp-btn-primary { background: ${C.ink}; color: #fff; padding: 14px 28px; font-size: ${T.body}px; border: none; }
        .lp-btn-primary:hover { background: #0a4a70; }
        .lp-btn-ghost { background: transparent; color: ${C.ink}; padding: 14px 24px; font-size: ${T.body}px; border: 1.5px solid ${C.border}; }
        .lp-container { max-width: 1120px; margin: 0 auto; padding-left: 40px; padding-right: 40px; }
        .lp-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 56px; align-items: center; }
        .lp-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        .lp-grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
        details.lp-faq summary { cursor: pointer; font-size: ${T.body}px; font-weight: ${W.semibold}; color: ${C.ink}; padding: 16px 0; list-style: none; display: flex; justify-content: space-between; align-items: center; }
        details.lp-faq summary::after { content: '+'; font-size: 20px; color: ${C.muted}; }
        details.lp-faq[open] summary::after { content: '–'; }
        details.lp-faq p { font-size: ${T.bodySm}px; color: ${C.muted}; line-height: 1.7; padding-bottom: 16px; }
        @media (max-width: 820px) {
          .lp-container { padding-left: 20px; padding-right: 20px; }
          .lp-grid-2, .lp-grid-3, .lp-grid-4 { grid-template-columns: 1fr; }
          .lp-nav-links { display: none; }
          .lp-hero-ctas { flex-direction: column; align-items: stretch; }
        }
      `}</style>

      {/* HEADER */}
      <header style={{ background: 'white', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, zIndex: 100 }}>
        <div className="lp-container" style={{ height: 68, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <img src="/zcheck-logo.png" alt="ZCheck" style={{ height: 32, width: 'auto' }} />
          <nav style={{ display: 'flex', alignItems: 'center', gap: 22 }} aria-label="Navegação principal">
            <a className="lp-nav-links" href="#como-funciona" style={{ fontSize: T.bodySm, fontWeight: W.medium, color: C.muted, textDecoration: 'none' }}>Como funciona</a>
            <a className="lp-nav-links" href="#para-quem" style={{ fontSize: T.bodySm, fontWeight: W.medium, color: C.muted, textDecoration: 'none' }}>Para quem</a>
            <a className="lp-nav-links" href="/entrar" style={{ fontSize: T.bodySm, fontWeight: W.medium, color: C.muted, textDecoration: 'none' }}>Entrar</a>
            <a href="/lista" className="lp-btn lp-btn-primary" style={{ padding: '10px 20px', fontSize: T.bodySm }}>Entrar na lista</a>
          </nav>
        </div>
      </header>

      {/* 1 · HERO */}
      <section style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
        <div className="lp-container lp-grid-2" style={{ paddingTop: 72, paddingBottom: 72 }}>
          <div>
            <Eyebrow color={C.success}>Inteligência operacional</Eyebrow>
            <h1 style={{ fontSize: 'clamp(32px, 4.5vw, 52px)', fontWeight: W.bold, lineHeight: 1.12, letterSpacing: '-0.02em', marginBottom: 20 }}>
              Saiba onde sua operação precisa de você — antes que vire problema.
            </h1>
            <p style={{ fontSize: T.bodyLg, color: C.muted, lineHeight: 1.7, maxWidth: 460, marginBottom: 32 }}>
              Sua equipe executa os checklists pelo celular. Você recebe, todo dia,
              um briefing com o que caiu, onde, e o que priorizar.
            </p>
            <div className="lp-hero-ctas" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
              <a href="/lista" className="lp-btn lp-btn-primary">Entrar na lista de acesso</a>
              <a href="#como-funciona" className="lp-btn lp-btn-ghost">Ver como funciona</a>
            </div>
            <p style={{ fontSize: T.caption, color: C.muted }}>
              Acesso antecipado gratuito · configuramos sua operação com você
            </p>
          </div>
          <BriefingExample />
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
                <Icon size={22} color={C.ink} aria-hidden style={{ marginBottom: 14 }} />
                <h3 style={{ fontSize: T.bodyLg, fontWeight: W.semibold, marginBottom: 8 }}>{title}</h3>
                <p style={{ fontSize: T.bodySm, color: C.muted, lineHeight: 1.65 }}>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3 · A VIRADA */}
      <section style={{ background: C.ink, color: 'white', padding: '72px 0' }}>
        <div className="lp-container lp-grid-2">
          <div>
            <Eyebrow color={GREEN_ON_DARK}>A diferença</Eyebrow>
            <h2 style={{ fontSize: 'clamp(24px, 3vw, 34px)', fontWeight: W.bold, lineHeight: 1.2, marginBottom: 18 }}>
              Não é mais um app de checklist.
            </h2>
            <p style={{ fontSize: T.body, lineHeight: 1.75, opacity: 0.85, maxWidth: 460 }}>
              O checklist é o insumo. O produto é o <strong>briefing do dia</strong>:
              toda manhã, a gestão recebe o que caiu ontem, o que está atrasado agora
              e o que ficou de ser tratado — com cobrança até resolver.
            </p>
          </div>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              ['Prioridades do dia', 'Itens críticos que ficaram pendentes mais de uma vez sobem para o topo — antes de virarem padrão.'],
              ['Plano de ação com cobrança', 'O que você marcar para tratar volta amanhã perguntando se foi resolvido. Nada evapora.'],
              ['Sem fadiga de alerta', 'O briefing só toma a tela quando há sinal real. Dia tranquilo não interrompe ninguém.'],
            ].map(([t, d]) => (
              <li key={t} style={{ border: '1px solid rgba(255,255,255,0.18)', borderRadius: R.md, padding: '16px 18px' }}>
                <p style={{ fontSize: T.body, fontWeight: W.semibold, marginBottom: 4 }}>{t}</p>
                <p style={{ fontSize: T.bodySm, opacity: 0.75, lineHeight: 1.6 }}>{d}</p>
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
              Do zero ao briefing em três passos.
            </h2>
          </div>
          <div className="lp-grid-3">
            {[
              ['Adote um modelo do seu setor', 'A biblioteca traz checklists prontos por segmento — restaurante, café, hotel, varejo, padaria. Adote e ajuste ao seu jeito.'],
              ['A equipe executa pelo celular', 'Cada colaborador vê só o que é do seu turno e setor. Foto onde importa, e funciona sem internet.'],
              ['Você recebe o briefing e age', 'O que caiu, o que atrasou, o que priorizar. E o que você marcar para tratar volta até ser resolvido.'],
            ].map(([t, d], i) => (
              <div key={t} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: R.md, padding: 24 }}>
                <p style={{ width: 34, height: 34, borderRadius: R.pill, background: C.ink, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: W.bold, fontSize: T.body, marginBottom: 14 }}>{i + 1}</p>
                <h3 style={{ fontSize: T.body, fontWeight: W.semibold, marginBottom: 8, lineHeight: 1.4 }}>{t}</h3>
                <p style={{ fontSize: T.bodySm, color: C.muted, lineHeight: 1.65 }}>{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5 · RECURSOS */}
      <section style={{ background: C.bg, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: '72px 0' }}>
        <div className="lp-container">
          <div className="lp-grid-4">
            {[
              { Icon: CheckSquare, title: 'Checklists por loja, setor e turno', text: 'Abertura, rotina e fechamento. Cada equipe vê só o que é dela.' },
              { Icon: Sun, title: 'Briefing diário para a gestão', text: 'Prioridades e cobranças do dia, direto de quem executou.' },
              { Icon: Camera, title: 'Evidência com foto', text: 'Itens críticos podem exigir foto. Histórico completo por período, loja e setor.' },
              { Icon: WifiOff, title: 'Funciona offline', text: 'Instala como app no celular. Sem sinal, registra local e sincroniza depois.' },
            ].map(({ Icon, title, text }) => (
              <div key={title} style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: R.md, padding: 22 }}>
                <Icon size={20} color={C.success} aria-hidden style={{ marginBottom: 12 }} />
                <h3 style={{ fontSize: T.bodySm, fontWeight: W.semibold, marginBottom: 6, lineHeight: 1.4 }}>{title}</h3>
                <p style={{ fontSize: T.caption, color: C.muted, lineHeight: 1.6 }}>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6 · PARA QUEM */}
      <section id="para-quem" style={{ padding: '72px 0' }}>
        <div className="lp-container" style={{ textAlign: 'center' }}>
          <Eyebrow>Para quem é</Eyebrow>
          <h2 style={{ fontSize: 'clamp(24px, 3vw, 34px)', fontWeight: W.bold, marginBottom: 28 }}>
            Operação física, várias frentes, pouco tempo.
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', maxWidth: 640, margin: '0 auto 16px' }}>
            {LIBRARY_VERTICALS.map(v => (
              <span key={v.id} style={{ fontSize: T.bodySm, fontWeight: W.semibold, color: C.ink, border: `1.5px solid ${C.border}`, borderRadius: R.pill, padding: '10px 20px' }}>
                {v.label}
              </span>
            ))}
          </div>
          <p style={{ fontSize: T.caption, color: C.muted }}>
            Outro setor? Conte na lista — a biblioteca de modelos cresce com a demanda.
          </p>
        </div>
      </section>

      {/* 7 · PROVA HONESTA + 8 · CTA */}
      <section style={{ background: C.ink, color: 'white', padding: '72px 0', textAlign: 'center' }}>
        <div className="lp-container" style={{ maxWidth: 660 }}>
          <p style={{ fontSize: T.bodySm, fontWeight: W.semibold, opacity: 0.75, marginBottom: 20 }}>
            Em operação diária nas lojas da Ilhabela Republic — nosso piloto fundador.
          </p>
          <h2 style={{ fontSize: 'clamp(26px, 3.4vw, 40px)', fontWeight: W.bold, marginBottom: 14 }}>
            Entre na lista de acesso
          </h2>
          <p style={{ fontSize: T.body, opacity: 0.8, lineHeight: 1.7, marginBottom: 32 }}>
            Acesso antecipado gratuito durante o piloto. Cada empresa é configurada
            manualmente pela nossa equipe — você recebe retorno em até 2 dias úteis.
          </p>
          {/* C.success, não successBright: texto branco sobre o verde vivo dá
              3.30:1 — a própria doc do token proíbe. Sobre #15803D: 5.02:1. */}
          <a href="/lista" className="lp-btn" style={{ background: C.success, color: 'white', padding: '15px 34px', fontSize: T.bodyLg, fontWeight: W.semibold }}>
            Entrar na lista
          </a>
          <p style={{ fontSize: T.caption, opacity: 0.6, marginTop: 14 }}>Sem cartão, sem compromisso.</p>
        </div>
      </section>

      {/* 9 · FAQ */}
      <section style={{ padding: '72px 0' }}>
        <div className="lp-container" style={{ maxWidth: 680 }}>
          <Eyebrow>Perguntas frequentes</Eyebrow>
          <div style={{ borderTop: `1px solid ${C.border}` }}>
            {[
              ['Quanto custa?', 'Durante o acesso antecipado, nada. O preço será definido junto com os primeiros clientes — quem entra agora participa dessa conversa.'],
              ['Precisa instalar alguma coisa?', 'Não. O ZCheck roda no navegador e pode ser adicionado à tela inicial do celular como um app (PWA). Sem loja de aplicativos, sem atualização manual.'],
              ['Funciona sem internet?', 'Sim. A execução registra tudo localmente e sincroniza quando a conexão volta — feito para estoque, câmara fria e subsolo.'],
              ['Como ficam os meus dados?', 'Isolados por empresa e tratados conforme a LGPD. Os detalhes estão nos Termos de Uso e na Política de Privacidade, no rodapé.'],
              ['Quanto tempo até começar a usar?', 'Depois do retorno (até 2 dias úteis), configuramos sua operação com você — lojas, setores e checklists — normalmente em uma única sessão.'],
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
          <img src="/zcheck-logo.png" alt="ZCheck" style={{ height: 26, width: 'auto', filter: 'brightness(0) invert(1)', opacity: 0.85 }} />
          <span style={{ fontSize: T.label, color: 'rgba(255,255,255,0.7)' }}>© 2026 INGO Administração de Negócios Ltda. CNPJ 34.164.735/0001-72</span>
          <nav style={{ display: 'flex', gap: 18 }} aria-label="Links legais">
            {[['Termos', '/termos'], ['Privacidade', '/privacidade'], ['Entrar', '/entrar'], ['Contato', WA]].map(([l, h]) => (
              <a key={l} href={h} style={{ fontSize: T.label, color: 'rgba(255,255,255,0.65)', textDecoration: 'none', fontWeight: W.medium }}>{l}</a>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
