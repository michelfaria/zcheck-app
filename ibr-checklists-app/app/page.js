'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Mail } from 'lucide-react';

const CONTACT_EMAIL = 'contato@zcheckapp.com';

const C = {
  navy:     '#063C5C',
  green:    '#31C85A',
  white:    '#FFFFFF',
  offwhite: '#F7F9FB',
  border:   '#E2EAF0',
  muted:    '#6B8299',
  dark:     '#04263D',
};

function ZCheckLogo({ size = 36 }) {
  return (
    <img src="/zcheck-logo.png" alt="ZCheck" height={size} width="auto" style={{ display: 'block', maxHeight: size, objectFit: 'contain' }} />
  );
}

function MockupPainel() {
  const bars = [
    { label: 'IBR1', pct: 94, color: '#1A6B4A' },
    { label: 'IBR2', pct: 78, color: '#C6842A' },
    { label: 'IBR3', pct: 87, color: '#0B3C5C' },
  ];
  return (
    <svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', borderRadius: 12 }}>
      <rect width="320" height="200" rx="12" fill="#F0F5F9" />
      <rect width="320" height="40" rx="12" fill="#063C5C" />
      <rect x="0" y="28" width="320" height="12" fill="#063C5C" />
      <text x="16" y="25" fontFamily="Inter,Arial,sans-serif" fontSize="12" fontWeight="700" fill="white">Painel — Score do dia</text>
      <circle cx="300" cy="20" r="8" fill="#31C85A" opacity="0.85" />
      <text x="297" y="24" fontFamily="Inter,Arial,sans-serif" fontSize="8" fontWeight="800" fill="white">✓</text>
      <text x="16" y="68" fontFamily="Inter,Arial,sans-serif" fontSize="11" fill="#6B8299" fontWeight="600">Score geral</text>
      <text x="16" y="90" fontFamily="Inter,Arial,sans-serif" fontSize="28" fontWeight="800" fill="#063C5C">86%</text>
      <rect x="90" y="74" width="60" height="6" rx="3" fill="#E2EAF0" />
      <rect x="90" y="74" width="52" height="6" rx="3" fill="#31C85A" />
      <text x="156" y="81" fontFamily="Inter,Arial,sans-serif" fontSize="9" fill="#31C85A" fontWeight="700">+4% semana</text>
      {bars.map((b, i) => {
        const y = 108 + i * 28;
        return (
          <g key={b.label}>
            <text x="16" y={y + 10} fontFamily="Inter,Arial,sans-serif" fontSize="10" fill="#063C5C" fontWeight="700">{b.label}</text>
            <rect x="52" y={y} width="210" height="14" rx="7" fill="#E2EAF0" />
            <rect x="52" y={y} width={210 * b.pct / 100} height="14" rx="7" fill={b.color} opacity="0.85" />
            <text x="270" y={y + 10} fontFamily="Inter,Arial,sans-serif" fontSize="10" fill="#063C5C" fontWeight="700">{b.pct}%</text>
          </g>
        );
      })}
      <text x="16" y="192" fontFamily="Inter,Arial,sans-serif" fontSize="9" fill="#6B8299">Atualizado agora · 3 lojas · 12 checklists</text>
    </svg>
  );
}

function MockupRelatorio() {
  const days = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const vals = [82, 91, 78, 95, 88, 72, 94];
  const maxH = 70;
  return (
    <svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', borderRadius: 12 }}>
      <rect width="320" height="200" rx="12" fill="#F0F5F9" />
      <rect width="320" height="40" rx="12" fill="#063C5C" />
      <rect x="0" y="28" width="320" height="12" fill="#063C5C" />
      <text x="16" y="25" fontFamily="Inter,Arial,sans-serif" fontSize="12" fontWeight="700" fill="white">Relatório — Últimos 7 dias</text>
      <line x1="16" y1="100" x2="304" y2="100" stroke="#E2EAF0" strokeWidth="1" strokeDasharray="4,3" />
      <text x="306" y="103" fontFamily="Inter,Arial,sans-serif" fontSize="8" fill="#6B8299">90%</text>
      {vals.map((v, i) => {
        const barH = (v / 100) * maxH;
        const x = 20 + i * 40;
        const y = 140 - barH;
        const isHigh = v >= 90;
        return (
          <g key={i}>
            <rect x={x} y={y} width="26" height={barH} rx="5" fill={isHigh ? '#31C85A' : '#063C5C'} opacity={isHigh ? 1 : 0.65} />
            <text x={x + 13} y="155" textAnchor="middle" fontFamily="Inter,Arial,sans-serif" fontSize="9" fill="#6B8299">{days[i]}</text>
            <text x={x + 13} y={y - 4} textAnchor="middle" fontFamily="Inter,Arial,sans-serif" fontSize="9" fontWeight="700" fill={isHigh ? '#31C85A' : '#063C5C'}>{v}%</text>
          </g>
        );
      })}
      <rect x="16" y="168" width="10" height="10" rx="2" fill="#31C85A" />
      <text x="30" y="177" fontFamily="Inter,Arial,sans-serif" fontSize="9" fill="#6B8299">Meta atingida</text>
      <rect x="110" y="168" width="10" height="10" rx="2" fill="#063C5C" opacity="0.65" />
      <text x="124" y="177" fontFamily="Inter,Arial,sans-serif" fontSize="9" fill="#6B8299">Abaixo da meta</text>
      <text x="16" y="194" fontFamily="Inter,Arial,sans-serif" fontSize="9" fill="#6B8299">Exportar PDF · CSV</text>
    </svg>
  );
}

function MockupChecklist() {
  const items = [
    { label: 'Abertura do caixa', done: true },
    { label: 'Limpeza do salão', done: true },
    { label: 'Conferência de estoque', done: false },
    { label: 'Briefing da equipe', done: false },
  ];
  return (
    <svg viewBox="0 0 160 220" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', maxWidth: 160, borderRadius: 16 }}>
      <rect width="160" height="220" rx="16" fill="white" />
      <rect width="160" height="44" rx="16" fill="#063C5C" />
      <rect x="0" y="30" width="160" height="14" fill="#063C5C" />
      <text x="12" y="20" fontFamily="Inter,Arial,sans-serif" fontSize="10" fontWeight="700" fill="white">Abertura · Salão</text>
      <text x="12" y="34" fontFamily="Inter,Arial,sans-serif" fontSize="8" fill="rgba(255,255,255,0.6)">IBR1 · hoje 08:00</text>
      {items.map((item, i) => {
        const y = 56 + i * 40;
        return (
          <g key={i}>
            <rect x="10" y={y} width="140" height="30" rx="8" fill={item.done ? '#F0FAF4' : 'white'} stroke={item.done ? '#31C85A' : '#E2EAF0'} strokeWidth="1.2" />
            <circle cx="28" cy={y + 15} r="9" fill={item.done ? '#31C85A' : 'white'} stroke={item.done ? '#31C85A' : '#E2EAF0'} strokeWidth="1.5" />
            {item.done && <path d={`M${23} ${y+15} L${27} ${y+19} L${33} ${y+11}`} stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />}
            <text x="44" y={y + 19} fontFamily="Inter,Arial,sans-serif" fontSize="9" fontWeight={item.done ? '600' : '700'} fill={item.done ? '#6B8299' : '#063C5C'}>{item.label}</text>
          </g>
        );
      })}
      <text x="12" y="208" fontFamily="Inter,Arial,sans-serif" fontSize="8" fill="#6B8299">2 de 4 concluídos</text>
      <rect x="10" y="210" width="140" height="4" rx="2" fill="#E2EAF0" />
      <rect x="10" y="210" width="70" height="4" rx="2" fill="#31C85A" />
    </svg>
  );
}

function Pill({ children }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#31C85A18', color: '#31C85A', fontWeight: 800, fontSize: 12, letterSpacing: 0.3, padding: '5px 12px', borderRadius: 99, border: '1px solid #31C85A30' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#31C85A', display: 'inline-block' }} />
      {children}
    </span>
  );
}

function FeatureCard({ icon, title, text }) {
  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E2EAF0', borderRadius: 14, padding: '24px 22px' }}>
      <div style={{ fontSize: 22, marginBottom: 10 }}>{icon}</div>
      <p style={{ margin: 0, fontWeight: 800, fontSize: 15, color: '#063C5C', marginBottom: 6 }}>{title}</p>
      <p style={{ margin: 0, fontSize: 14, color: '#6B8299', lineHeight: 1.6 }}>{text}</p>
    </div>
  );
}

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  return (
    <main style={{ minHeight: '100vh', background: '#F7F9FB', color: '#063C5C', fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif" }}>

      <header style={{ position: 'sticky', top: 0, zIndex: 100, background: scrolled ? 'rgba(255,255,255,0.92)' : '#FFFFFF', backdropFilter: 'blur(12px)', borderBottom: `1px solid ${scrolled ? '#E2EAF0' : 'transparent'}`, transition: 'all 0.2s' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/" style={{ textDecoration: 'none' }}>
            <ZCheckLogo size={36} />
          </a>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: '#6B8299', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>Falar com a gente</a>
            <a href="/app" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#063C5C', color: 'white', fontWeight: 700, fontSize: 13, padding: '9px 18px', borderRadius: 8, textDecoration: 'none' }}>
              Acessar <ArrowRight size={14} />
            </a>
          </div>
        </div>
      </header>

      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '80px 24px 64px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 56, alignItems: 'center' }}>
          <div>
            <Pill>Inteligência operacional para negócios físicos</Pill>
            <h1 style={{ margin: '20px 0 0', fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 900, lineHeight: 1.05, letterSpacing: '-1.5px', color: '#063C5C' }}>
              Faça bem feito.<br />
              <span style={{ color: '#31C85A' }}>Todo dia.</span>
            </h1>
            <p style={{ margin: '20px 0 0', fontSize: 17, color: '#6B8299', lineHeight: 1.7, maxWidth: 460 }}>
              Checklists por loja, setor e turno. Sua equipe executa, sua gestão enxerga tudo — em tempo real.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 32 }}>
              <a href="/app" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#063C5C', color: 'white', fontWeight: 800, fontSize: 15, padding: '13px 22px', borderRadius: 10, textDecoration: 'none' }}>
                Acessar o app <ArrowRight size={17} />
              </a>
              <a href={`mailto:${CONTACT_EMAIL}?subject=Quero conhecer o ZCheck`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#FFFFFF', color: '#063C5C', fontWeight: 700, fontSize: 15, padding: '13px 22px', borderRadius: 10, border: '1.5px solid #E2EAF0', textDecoration: 'none' }}>
                Falar com a gente <Mail size={16} />
              </a>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <MockupPainel />
              <MockupRelatorio />
            </div>
            <div style={{ paddingTop: 24 }}>
              <MockupChecklist />
            </div>
          </div>
        </div>
      </section>

      <section style={{ background: '#FFFFFF', borderTop: '1px solid #E2EAF0', borderBottom: '1px solid #E2EAF0' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '64px 24px' }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 800, color: '#063C5C', textAlign: 'center' }}>Tudo que sua operação precisa</h2>
          <p style={{ margin: '0 0 40px', fontSize: 15, color: '#6B8299', textAlign: 'center' }}>Simples para a equipe. Poderoso para a gestão.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <FeatureCard icon="📋" title="Checklists por turno" text="Abertura, rotina e fechamento por loja e setor. Cada equipe vê só o que é dela." />
            <FeatureCard icon="📊" title="Painel em tempo real" text="Score por loja, ranking de equipe e pendências visíveis para liderança e gestão." />
            <FeatureCard icon="📁" title="Relatórios exportáveis" text="Histórico completo em PDF ou CSV. Filtros por período, loja e setor." />
            <FeatureCard icon="📱" title="PWA — funciona offline" text="Instala como app no celular. Funciona sem internet e sincroniza ao reconectar." />
          </div>
        </div>
      </section>

      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '72px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 48, alignItems: 'center' }}>
          <div>
            <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 800, color: '#31C85A', letterSpacing: 1, textTransform: 'uppercase' }}>Como funciona</p>
            <h2 style={{ margin: '0 0 16px', fontSize: 32, fontWeight: 900, color: '#063C5C', lineHeight: 1.15 }}>Três passos para uma operação controlada</h2>
            <p style={{ margin: 0, fontSize: 15, color: '#6B8299', lineHeight: 1.7 }}>Configure uma vez. Sua equipe executa todo dia. Você acompanha tudo.</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { n: '1', title: 'Configure lojas, setores e rotinas', text: 'Cadastre suas unidades, crie checklists para cada turno e defina responsabilidades.' },
              { n: '2', title: 'Equipe executa pelo celular', text: 'Cada colaborador vê seus checklists do turno e registra evidências quando necessário.' },
              { n: '3', title: 'Gestão acompanha e age', text: 'Painel de score e relatórios ajudam líderes a agir antes que desvios virem problema.' },
            ].map(s => (
              <div key={s.n} style={{ display: 'flex', gap: 16, background: '#FFFFFF', border: '1px solid #E2EAF0', borderRadius: 12, padding: '18px 20px' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: '#063C5C', color: 'white', display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: 14, flexShrink: 0 }}>{s.n}</div>
                <div>
                  <p style={{ margin: '0 0 4px', fontWeight: 800, fontSize: 14, color: '#063C5C' }}>{s.title}</p>
                  <p style={{ margin: 0, fontSize: 13, color: '#6B8299', lineHeight: 1.6 }}>{s.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ background: '#063C5C' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '64px 24px', textAlign: 'center' }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 34, fontWeight: 900, color: 'white', lineHeight: 1.1 }}>Pronto para organizar sua operação?</h2>
          <p style={{ margin: '0 0 32px', fontSize: 16, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>Fale com a gente e coloque o ZCheck funcionando na sua empresa esta semana.</p>
          <a href={`mailto:${CONTACT_EMAIL}?subject=Quero conhecer o ZCheck`} style={{ display: 'inline-flex', alignItems: 'center', gap: 9, background: '#31C85A', color: '#04263D', fontWeight: 900, fontSize: 16, padding: '15px 28px', borderRadius: 10, textDecoration: 'none' }}>
            Entrar em contato <Mail size={18} />
          </a>
        </div>
      </section>

      <footer style={{ background: '#04263D', color: 'rgba(255,255,255,0.45)', padding: '28px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <ZCheckLogo size={24} />
          <p style={{ margin: 0, fontSize: 12 }}>© {new Date().getFullYear()} INGO Administração de Negócios Ltda · CNPJ 34.164.735/0001-72</p>
          <div style={{ display: 'flex', gap: 16 }}>
            <a href="/termos" style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, textDecoration: 'none' }}>Termos de uso</a>
            <a href="/privacidade" style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, textDecoration: 'none' }}>Privacidade</a>
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, textDecoration: 'none' }}>{CONTACT_EMAIL}</a>
          </div>
        </div>
      </footer>

    </main>
  );
}
