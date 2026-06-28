'use client';

export default function LandingPage() {
  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", color: '#102A3A', background: '#fff', overflowX: 'hidden' }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .btn-green { background: #31C85A; color: #fff; border: none; padding: 14px 28px; border-radius: 10px; font-size: 15px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; text-decoration: none; }
        .btn-green:hover { background: #28b04e; }
        .btn-white { background: transparent; color: #fff; border: 2px solid rgba(255,255,255,0.5); padding: 14px 28px; border-radius: 10px; font-size: 15px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; text-decoration: none; }
        .btn-blue { background: #063C5C; color: #fff; border: none; padding: 11px 22px; border-radius: 10px; font-size: 14px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; text-decoration: none; }
        @media (max-width: 768px) {
          .hero-mockup { display: none !important; }
          .benefits-grid { grid-template-columns: 1fr !important; }
          .how-grid { flex-direction: column !important; }
          .steps-grid { flex-direction: column !important; }
          .footer-inner { flex-direction: column !important; align-items: center !important; text-align: center !important; gap: 16px !important; }
          .hero-inner { padding: 48px 20px !important; }
          .section-pad { padding: 60px 20px !important; }
          .header-nav { display: none !important; }
          .btn-blue-header { padding: 10px 16px !important; font-size: 13px !important; }
          .hero-btns { flex-direction: column !important; align-items: stretch !important; }
          .btn-green, .btn-white { justify-content: center !important; width: 100% !important; }
        }
      `}</style>

      {/* HEADER */}
      <header style={{ background: '#fff', borderBottom: '1px solid rgba(6,60,92,0.08)', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 40px', height: 72, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <img src="/zcheck-logo.png" alt="ZCheck" style={{ height: 32, width: 'auto' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <a href="https://wa.me/5512988017472?text=Olá%2C%20gostaria%20de%20saber%20mais%20sobre%20o%20ZCheck!" className="header-nav" style={{ fontSize: 14, fontWeight: 600, color: '#063C5C', textDecoration: 'none' }}>Fale conosco</a>
            <a href="/app" className="btn-blue btn-blue-header">Acessar →</a>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section style={{ background: 'linear-gradient(135deg, #063C5C 0%, #0a5a72 60%, #0d7a6e 100%)' }}>
        <div className="hero-inner" style={{ maxWidth: 1180, margin: '0 auto', padding: '80px 40px', display: 'flex', alignItems: 'center', gap: 64 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 999, padding: '6px 16px', marginBottom: 32 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#31C85A', display: 'inline-block' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Inteligência operacional para negócios físicos</span>
            </div>
            <h1 style={{ fontSize: 'clamp(36px, 5vw, 60px)', fontWeight: 800, color: '#fff', lineHeight: 1.1, marginBottom: 8 }}>Faça bem feito.</h1>
            <h1 style={{ fontSize: 'clamp(36px, 5vw, 60px)', fontWeight: 800, color: '#31C85A', lineHeight: 1.1, marginBottom: 28 }}>Todo dia.</h1>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.82)', lineHeight: 1.7, maxWidth: 440, marginBottom: 40 }}>Checklists por loja, setor e turno. Sua equipe executa, sua gestão enxerga tudo — em tempo real.</p>
            <div className="hero-btns" style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <a href="/app" className="btn-green">Acessar o app →</a>
              <a href="https://wa.me/5512988017472?text=Olá%2C%20gostaria%20de%20saber%20mais%20sobre%20o%20ZCheck!" className="btn-white">Fale conosco</a>
            </div>
          </div>

          {/* MOCKUP */}
          <div className="hero-mockup" style={{ flex: 1, maxWidth: 480 }}>
            <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 32px 80px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
              <div style={{ background: '#063C5C', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF5F57' }} />
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FEBC2E' }} />
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28C840' }} />
                <span style={{ marginLeft: 8, fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>Dashboard Operacional</span>
              </div>
              <div style={{ padding: 16, display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ background: '#F7FAFC', borderRadius: 10, padding: 14, marginBottom: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#063C5C', marginBottom: 10 }}>Painel — Score do dia</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 56, height: 56, borderRadius: '50%', border: '4px solid #31C85A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#063C5C', flexShrink: 0 }}>86%</div>
                      <div style={{ flex: 1 }}>
                        {[['Abertura', 94], ['Rotina', 79], ['Fechamento', 87]].map(([l, v]) => (
                          <div key={l} style={{ marginBottom: 5 }}>
                            <div style={{ fontSize: 8, color: '#6B8299', marginBottom: 2 }}>{l} {v}%</div>
                            <div style={{ height: 4, background: '#E2EAF0', borderRadius: 99 }}>
                              <div style={{ width: `${v}%`, height: '100%', background: '#31C85A', borderRadius: 99 }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div style={{ background: '#F7FAFC', borderRadius: 10, padding: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#063C5C', marginBottom: 10 }}>Relatório — Últimos 7 dias</div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 52 }}>
                      {[['Seg',91],['Ter',67],['Qua',71],['Qui',94],['Sex',65],['Sáb',72],['Dom',84]].map(([d,v]) => (
                        <div key={d} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                          <span style={{ fontSize: 7, color: '#063C5C', fontWeight: 700 }}>{v}%</span>
                          <div style={{ width: '100%', height: `${v*0.44}px`, background: v>=80?'#31C85A':'#A8BCC8', borderRadius: '2px 2px 0 0' }} />
                          <span style={{ fontSize: 7, color: '#6B8299' }}>{d}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div style={{ width: 130, background: '#102A3A', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#fff', marginBottom: 10 }}>Alertas de hoje</div>
                  {[{c:'#FF6B6B',t:'Abertura do turno tardia na Loja 2.'},{c:'#FEBC2E',t:'Conferência pendente em tempo real.'}].map((a,i)=>(
                    <div key={i} style={{ display: 'flex', gap: 5, marginBottom: 8, alignItems: 'flex-start' }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: a.c, flexShrink: 0, marginTop: 3 }} />
                      <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.75)', lineHeight: 1.4 }}>{a.t}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BENEFÍCIOS */}
      <section className="section-pad" style={{ background: '#fff', padding: '80px 40px' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <h2 style={{ fontSize: 'clamp(26px, 3.5vw, 38px)', fontWeight: 800, color: '#102A3A', marginBottom: 12 }}>Tudo o que sua operação precisa</h2>
            <p style={{ fontSize: 16, color: '#6B8299' }}>Simples para a equipe. Poderoso para a gestão.</p>
          </div>
          <div className="benefits-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18 }}>
            {[
              { icon: '☑️', title: 'Checklists por turno', text: 'Abertura, rotina e fechamento por loja e setor. Cada equipe vê só o que é dela.' },
              { icon: '📊', title: 'Painel em tempo real', text: 'Pontuação por loja, ranking da equipe e pendências visuais para a liderança e gestão.' },
              { icon: '📄', title: 'Relatórios exportáveis', text: 'Histórico completo em PDF ou CSV. Filtros por período, loja e setor.' },
              { icon: '📱', title: 'PWA — funciona offline', text: 'Instala como app no celular. Funciona sem internet e sincroniza ao reconectar.' },
            ].map((c) => (
              <div key={c.title} style={{ background: '#F7FAFC', border: '1px solid #E5E7EB', borderRadius: 16, padding: 24 }}>
                <div style={{ fontSize: 28, marginBottom: 14 }}>{c.icon}</div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#102A3A', marginBottom: 8 }}>{c.title}</h3>
                <p style={{ fontSize: 13, color: '#6B8299', lineHeight: 1.6 }}>{c.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section className="section-pad" style={{ background: '#F7FAFC', padding: '80px 40px' }}>
        <div className="how-grid" style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', gap: 56, alignItems: 'flex-start' }}>
          <div style={{ flex: '0 0 300px' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#31C85A', letterSpacing: '0.1em', marginBottom: 14 }}>COMO FUNCIONA</div>
            <h2 style={{ fontSize: 'clamp(22px, 3vw, 34px)', fontWeight: 800, color: '#102A3A', lineHeight: 1.2, marginBottom: 18 }}>Três passos para uma operação controlada</h2>
            <p style={{ fontSize: 15, color: '#6B8299', lineHeight: 1.7 }}>Configure uma vez. Sua equipe executa todo dia. Você acompanha tudo.</p>
          </div>
          <div className="steps-grid" style={{ flex: 1, display: 'flex', gap: 14 }}>
            {[
              { n: 1, title: 'Configure lojas, setores e rotinas', text: 'Cadastre lojas, unidades, crie checklists para cada turno e defina responsabilidades.' },
              { n: 2, title: 'Equipe executa pelo celular', text: 'Cada colaborador vê seus checklists do turno e registra evidências quando necessário.' },
              { n: 3, title: 'Gestão acompanha', text: 'Acompanhe checklists em tempo real e identifique desvios antes que virem problemas.' },
            ].map((s) => (
              <div key={s.n} style={{ flex: 1, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14, padding: 22 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#063C5C', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, marginBottom: 14 }}>{s.n}</div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#102A3A', marginBottom: 8, lineHeight: 1.4 }}>{s.title}</h3>
                <p style={{ fontSize: 13, color: '#6B8299', lineHeight: 1.6 }}>{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: 'linear-gradient(135deg, #102A3A 0%, #063C5C 100%)', padding: '80px 40px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 'clamp(26px, 3.5vw, 42px)', fontWeight: 800, color: '#fff', marginBottom: 14 }}>Pronto para organizar sua operação?</h2>
        <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.7)', marginBottom: 40 }}>Fale conosco e coloque o ZCheck funcionando em sua empresa.</p>
        <a href="https://wa.me/5512988017472?text=Olá%2C%20gostaria%20de%20saber%20mais%20sobre%20o%20ZCheck!" className="btn-green" style={{ fontSize: 16, padding: '15px 32px' }}>Entrar em contato</a>
      </section>

      {/* FOOTER */}
      <footer style={{ background: '#0a1f2e', padding: '28px 40px' }}>
        <div className="footer-inner" style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
          <img src="/zcheck-logo.png" alt="ZCheck" style={{ height: 26, width: 'auto', filter: 'brightness(0) invert(1)', opacity: 0.8 }} />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>© 2026 INGO Administração de Negócios Ltda. CNPJ 34.164.735/0001-72</span>
          <div style={{ display: 'flex', gap: 20 }}>
            {[['Termos', '/termos'],['Privacidade', '/privacidade'],['Contato', 'https://wa.me/5512988017472?text=Olá%2C%20gostaria%20de%20saber%20mais%20sobre%20o%20ZCheck!']].map(([l,h])=>(
              <a key={l} href={h} style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', textDecoration: 'none', fontWeight: 600 }}>{l}</a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
