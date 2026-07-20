'use client';
import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { track, flushEvents } from '../../lib/track';

export default function EntrarPage() {
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  // Resolve a empresa 100% pelo BANCO: primeiro `company_codes` (códigos
  // alternativos, geridos no ZCheck Core), depois a slug de `companies`.
  // O subdomínio de destino vem de companies.subdomain (fallback: slug) —
  // os mapas fixos que viviam aqui migraram para essas tabelas em 19/07.
  async function handleEntrar(e) {
    e.preventDefault();
    const typed = codigo.trim().toLowerCase().replace(/\s+/g, '');
    if (!typed) { setErro('Digite o código da sua empresa.'); return; }

    setErro(''); setLoading(true);
    try {
      const { data: codeRow } = await supabase
        .from('company_codes')
        .select('company_id')
        .eq('code', typed)
        .maybeSingle();

      let query = supabase.from('companies').select('id, slug, subdomain').eq('active', true);
      query = codeRow ? query.eq('id', codeRow.company_id) : query.eq('slug', typed);
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      if (!data) {
        track('company_code_entered', { source: 'entrar', metadata: { code: typed, found: false } });
        setErro('Código não encontrado. Verifique e tente novamente.');
        setLoading(false);
        return;
      }
      // Drena a fila ANTES do redirect: o subdomínio é outra origem, com outro
      // IndexedDB — sem o flush aqui, este evento nunca chegaria ao Supabase.
      await track('company_code_entered', { companyId: data.id, source: 'entrar', metadata: { code: typed, found: true } });
      await flushEvents();
      const sub = data.subdomain || data.slug;
      window.location.href = `https://${sub}.zcheckapp.com/app`;
    } catch {
      setErro('Não foi possível verificar agora. Tente novamente.');
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F7FAFC', fontFamily: "'Inter', system-ui, sans-serif", display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      {/* Header claro + logo horizontal, igual à landing (era faixa azul). */}
      <header style={{ background: '#fff', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid #E5E7EB' }}>
        <a href="/">
          <img src="/zcheck-logo.png" alt="ZCheck" style={{ height: 32, width: 'auto' }} />
        </a>
      </header>

      {/* Conteúdo */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#102A3A', marginBottom: 8 }}>Acessar o ZCheck</h1>
            <p style={{ fontSize: 15, color: '#64748B' }}>Digite o código da sua empresa para continuar</p>
          </div>

          <form onSubmit={handleEntrar} style={{ background: '#fff', borderRadius: 16, border: '1px solid #E5E7EB', padding: 28, boxShadow: '0 8px 24px rgba(15,23,42,0.06)' }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#64748B', marginBottom: 8 }}>
              Código da empresa
            </label>
            <input
              type="text"
              value={codigo}
              onChange={e => { setCodigo(e.target.value); setErro(''); }}
              placeholder="ex: minha-empresa"
              autoFocus
              style={{ width: '100%', padding: '12px 14px', fontSize: 15, border: `1.5px solid ${erro ? '#DC2626' : '#E5E7EB'}`, borderRadius: 10, outline: 'none', color: '#102A3A', background: '#fff', marginBottom: erro ? 8 : 20, transition: 'border 0.2s' }}
              onFocus={e => e.target.style.borderColor = '#063C5C'}
              onBlur={e => e.target.style.borderColor = erro ? '#DC2626' : '#E5E7EB'}
            />
            {erro && (
              <p style={{ fontSize: 13, color: '#DC2626', marginBottom: 16 }}>{erro}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              style={{ width: '100%', padding: '13px', background: loading ? '#64748B' : '#063C5C', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              {loading ? 'Verificando...' : 'Continuar →'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: '#64748B' }}>
            Não sabe seu código?{' '}
            <a href="https://wa.me/5512988017472?text=Olá%2C%20preciso%20do%20código%20da%20minha%20empresa%20no%20ZCheck" style={{ color: '#063C5C', fontWeight: 700, textDecoration: 'none' }}>
              Fale conosco
            </a>
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer style={{ padding: '20px 40px', textAlign: 'center' }}>
        <span style={{ fontSize: 12, color: '#94A3B8' }}>© 2026 ZCheck · INGO Administração de Negócios Ltda.</span>
      </footer>
    </div>
  );
}
