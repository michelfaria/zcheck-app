'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://rjuulamozdhssgqrzfji.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqdXVsYW1vemRoc3NncXJ6ZmppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNjc5MjksImV4cCI6MjA5Nzg0MzkyOX0.xxpJLp5SCpQRxMcuDMo-XD8offX2hrVUC_bU9I8me2M';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });

const C = {
  ink: '#063C5C', bg: '#F7F9FB', border: '#E2EAF0',
  muted: '#6B8299', success: '#31C85A', critical: '#D1462F',
};

const uid = () => Math.random().toString(36).slice(2, 10);
const slug = (name) => name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

const SEGMENT_TEMPLATES = {
  restaurante: {
    units: ['Loja Principal'],
    sectors: ['Salão', 'Cozinha', 'Caixa'],
    types: ['Abertura', 'Intermediário', 'Fechamento'],
  },
  cafe: {
    units: ['Unidade 1'],
    sectors: ['Salão', 'Bar', 'Caixa'],
    types: ['Abertura', 'Intermediário', 'Fechamento'],
  },
  hotel: {
    units: ['Hotel'],
    sectors: ['Recepção', 'Governança', 'Manutenção', 'Alimentos & Bebidas'],
    types: ['Abertura', 'Intermediário', 'Fechamento', 'Vistoria'],
  },
  varejo: {
    units: ['Loja 1'],
    sectors: ['Piso de Vendas', 'Estoque', 'Caixa'],
    types: ['Abertura', 'Conferência', 'Fechamento'],
  },
  padaria: {
    units: ['Padaria'],
    sectors: ['Atendimento', 'Produção', 'Caixa'],
    types: ['Abertura', 'Produção Diária', 'Fechamento'],
  },
  personalizado: {
    units: [],
    sectors: [],
    types: [],
  },
};

const COLORS = [
  '#063C5C', '#1A6B4A', '#C6842A', '#0B3C5C', '#7B3FA0',
  '#B5451B', '#1E7A6E', '#8B4513', '#2C5F8A', '#6B4226',
];

function Step({ n, label, active, done }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div style={{
        width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 800, fontSize: 13,
        background: done ? C.success : active ? C.ink : C.border,
        color: done || active ? 'white' : C.muted,
        transition: 'all 0.2s',
      }}>
        {done ? '✓' : n}
      </div>
      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: active ? C.ink : C.muted }}>{label}</span>
    </div>
  );
}

function Input({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div>
      {label && <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, marginBottom: 6 }}>{label}</p>}
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', fontSize: 14, fontWeight: 600, color: C.ink, background: 'white', padding: '12px 14px',
          border: `1.5px solid ${C.border}`, borderRadius: 10, outline: 'none', fontFamily: 'inherit' }} />
    </div>
  );
}

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  // Step 1 — Empresa
  const [companyName, setCompanyName] = useState('');
  const [segment, setSegment] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#063C5C');

  // Step 2 — Lojas
  const [units, setUnits] = useState([{ id: uid(), name: '', color: '#063C5C' }]);

  // Step 3 — Setores
  const [sectors, setSectors] = useState([]);

  // Step 4 — Tipos de checklist
  const [types, setTypes] = useState([
    { id: uid(), name: 'Abertura' },
    { id: uid(), name: 'Intermediário' },
    { id: uid(), name: 'Fechamento' },
  ]);

  // Step 5 — Gestor
  const [gestorName, setGestorName] = useState('');
  const [gestorPin, setGestorPin] = useState('');
  const [gestorPin2, setGestorPin2] = useState('');

  const applyTemplate = (seg) => {
    setSegment(seg);
    const tpl = SEGMENT_TEMPLATES[seg];
    if (!tpl) return;
    if (tpl.units.length) setUnits(tpl.units.map(n => ({ id: uid(), name: n, color: primaryColor })));
    if (tpl.types.length) setTypes(tpl.types.map(n => ({ id: uid(), name: n })));
    // Sectors will be set in step 3 based on units
    if (tpl.sectors.length && tpl.units.length) {
      setSectors(tpl.sectors.map(s => ({ id: uid(), name: s, unitId: null })));
    }
  };

  const goNext = () => {
    setError('');
    if (step === 1 && !companyName.trim()) { setError('Informe o nome da empresa.'); return; }
    if (step === 2 && units.some(u => !u.name.trim())) { setError('Preencha o nome de todas as lojas.'); return; }
    if (step === 5) { submit(); return; }
    setStep(s => s + 1);
    // Pre-populate sectors for step 3
    if (step === 2 && sectors.length === 0) {
      const tpl = SEGMENT_TEMPLATES[segment];
      if (tpl?.sectors.length) {
        setSectors(tpl.sectors.map(s => ({ id: uid(), name: s, unitId: units[0]?.id || null })));
      } else {
        setSectors([{ id: uid(), name: '', unitId: units[0]?.id || null }]);
      }
    }
  };

  const submit = async () => {
    if (!gestorName.trim()) { setError('Informe o nome do gestor.'); return; }
    if (!/^\d{4}$/.test(gestorPin)) { setError('O PIN deve ter 4 dígitos.'); return; }
    if (gestorPin !== gestorPin2) { setError('Os PINs não coincidem.'); return; }

    setSaving(true);
    setError('');
    try {
      const companyId = slug(companyName) + '-' + uid();
      const companySlug = slug(companyName);

      // 1. Create company
      await supabase.from('companies').insert({
        id: companyId, name: companyName.trim(), slug: companySlug,
        primary_color: primaryColor, plan: 'trial', active: true,
      });

      // 2. Create units
      const unitRows = units.filter(u => u.name.trim()).map((u, i) => ({
        id: u.id, company_id: companyId, name: u.name.trim(),
        color: u.color, active: true, sort_order: i,
      }));
      if (unitRows.length) await supabase.from('units').insert(unitRows);

      // 3. Create sectors
      const sectorRows = sectors.filter(s => s.name.trim()).map((s, i) => ({
        id: s.id, company_id: companyId,
        unit_id: s.unitId || unitRows[0]?.id,
        name: s.name.trim(), sort_order: i,
      }));
      if (sectorRows.length) await supabase.from('sectors').insert(sectorRows);

      // 4. Create checklist types
      const typeRows = types.filter(t => t.name.trim()).map((t, i) => ({
        id: t.id, company_id: companyId, name: t.name.trim(), sort_order: i,
      }));
      if (typeRows.length) await supabase.from('checklist_types').insert(typeRows);

      // 5. Create gestão user
      await supabase.from('users').insert({
        id: uid(), company_id: companyId, name: gestorName.trim(),
        pin: gestorPin, role: 'gestao', unit_id: null, sector_id: null,
        suspended: false,
      });

      setDone(true);
    } catch (e) {
      console.error(e);
      setError('Erro ao criar empresa. Tente novamente.');
    }
    setSaving(false);
  };

  if (done) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ fontSize: 72, marginBottom: 16 }}>🎉</div>
      <h1 style={{ fontSize: 26, fontWeight: 800, color: C.ink, textAlign: 'center', marginBottom: 8 }}>Empresa criada!</h1>
      <p style={{ fontSize: 14, color: C.muted, textAlign: 'center', maxWidth: 320, lineHeight: 1.6, marginBottom: 32 }}>
        <strong>{companyName}</strong> está pronta no ZCheck. Acesse o app com o PIN do gestor e comece a configurar seus checklists.
      </p>
      <a href="/app" style={{ padding: '14px 32px', borderRadius: 12, background: C.ink, color: 'white', fontWeight: 800, fontSize: 15, textDecoration: 'none' }}>
        Ir para o app →
      </a>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '32px 20px 100px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: C.muted, marginBottom: 4, letterSpacing: '-0.03em' }}>
            <span style={{ color: '#063C5C' }}>Z</span>chek
          </div>
          <p style={{ fontSize: 13, color: C.muted }}>Configure sua empresa em 5 passos</p>
        </div>

        {/* Steps indicator */}
        <div className="flex items-start justify-between" style={{ marginBottom: 32, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 16, left: '10%', right: '10%', height: 2, background: C.border, zIndex: 0 }} />
          {['Empresa', 'Lojas', 'Setores', 'Tipos', 'Gestor'].map((label, i) => (
            <Step key={i} n={i + 1} label={label} active={step === i + 1} done={step > i + 1} />
          ))}
        </div>

        {/* ── STEP 1: Empresa ── */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 style={{ fontSize: 20, fontWeight: 800, color: C.ink, marginBottom: 4 }}>Sobre sua empresa</h2>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>Essas informações identificam sua empresa no ZCheck.</p>

            <Input label="Nome da empresa" value={companyName} onChange={setCompanyName} placeholder="Ex: Padaria do João, Hotel Central..." />

            <div>
              <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, marginBottom: 8 }}>Segmento</p>
              <div className="flex flex-wrap gap-2">
                {Object.keys(SEGMENT_TEMPLATES).map(seg => (
                  <button key={seg} onClick={() => applyTemplate(seg)}
                    style={{ padding: '8px 16px', borderRadius: 20, fontWeight: 700, fontSize: 13, cursor: 'pointer',
                      background: segment === seg ? C.ink : 'white',
                      color: segment === seg ? 'white' : C.muted,
                      border: `1.5px solid ${segment === seg ? C.ink : C.border}` }}>
                    {seg === 'personalizado' ? '+ Personalizado' : seg.charAt(0).toUpperCase() + seg.slice(1)}
                  </button>
                ))}
              </div>
              {segment && segment !== 'personalizado' && (
                <p style={{ fontSize: 11, color: C.success, marginTop: 8, fontWeight: 700 }}>
                  ✓ Estrutura de {segment} pré-carregada — você pode ajustar nos próximos passos
                </p>
              )}
            </div>

            <div>
              <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, marginBottom: 8 }}>Cor principal</p>
              <div className="flex flex-wrap gap-2">
                {COLORS.map(c => (
                  <button key={c} onClick={() => setPrimaryColor(c)}
                    style={{ width: 36, height: 36, borderRadius: '50%', background: c, border: primaryColor === c ? `3px solid ${C.ink}` : '3px solid transparent', cursor: 'pointer', outline: primaryColor === c ? `2px solid white` : 'none', outlineOffset: -4 }} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 2: Lojas ── */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 style={{ fontSize: 20, fontWeight: 800, color: C.ink, marginBottom: 4 }}>Suas lojas / unidades</h2>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>Adicione cada loja ou unidade operacional.</p>
            <div className="space-y-3">
              {units.map((u, i) => (
                <div key={u.id} className="flex items-center gap-2">
                  <input type="color" value={u.color} onChange={e => setUnits(prev => prev.map(x => x.id === u.id ? { ...x, color: e.target.value } : x))}
                    style={{ width: 42, height: 42, borderRadius: 8, border: `1.5px solid ${C.border}`, cursor: 'pointer', padding: 2, flexShrink: 0 }} />
                  <input value={u.name} onChange={e => setUnits(prev => prev.map(x => x.id === u.id ? { ...x, name: e.target.value } : x))}
                    placeholder={`Loja ${i + 1}`}
                    style={{ flex: 1, fontSize: 14, fontWeight: 600, color: C.ink, background: 'white', padding: '12px 14px',
                      border: `1.5px solid ${C.border}`, borderRadius: 10, outline: 'none', fontFamily: 'inherit' }} />
                  {units.length > 1 && (
                    <button onClick={() => setUnits(prev => prev.filter(x => x.id !== u.id))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 18, padding: '0 4px' }}>×</button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={() => setUnits(prev => [...prev, { id: uid(), name: '', color: primaryColor }])}
              style={{ width: '100%', padding: '12px', borderRadius: 10, border: `2px dashed ${C.border}`, fontWeight: 700, color: C.muted, background: 'none', cursor: 'pointer', fontSize: 14 }}>
              + Adicionar loja
            </button>
          </div>
        )}

        {/* ── STEP 3: Setores ── */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 style={{ fontSize: 20, fontWeight: 800, color: C.ink, marginBottom: 4 }}>Setores operacionais</h2>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>Defina os setores de cada loja (ex: Salão, Cozinha, Caixa).</p>
            <div className="space-y-3">
              {sectors.map((s, i) => (
                <div key={s.id} className="flex items-center gap-2">
                  {units.length > 1 && (
                    <select value={s.unitId || ''} onChange={e => setSectors(prev => prev.map(x => x.id === s.id ? { ...x, unitId: e.target.value } : x))}
                      style={{ fontSize: 12, fontWeight: 700, color: C.ink, background: 'white', padding: '12px 8px',
                        border: `1.5px solid ${C.border}`, borderRadius: 8, outline: 'none', flexShrink: 0 }}>
                      <option value="">Loja?</option>
                      {units.map(u => <option key={u.id} value={u.id}>{u.name || `Loja ${units.indexOf(u)+1}`}</option>)}
                    </select>
                  )}
                  <input value={s.name} onChange={e => setSectors(prev => prev.map(x => x.id === s.id ? { ...x, name: e.target.value } : x))}
                    placeholder={`Setor ${i + 1}`}
                    style={{ flex: 1, fontSize: 14, fontWeight: 600, color: C.ink, background: 'white', padding: '12px 14px',
                      border: `1.5px solid ${C.border}`, borderRadius: 10, outline: 'none', fontFamily: 'inherit' }} />
                  {sectors.length > 1 && (
                    <button onClick={() => setSectors(prev => prev.filter(x => x.id !== s.id))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 18, padding: '0 4px' }}>×</button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={() => setSectors(prev => [...prev, { id: uid(), name: '', unitId: units[0]?.id || null }])}
              style={{ width: '100%', padding: '12px', borderRadius: 10, border: `2px dashed ${C.border}`, fontWeight: 700, color: C.muted, background: 'none', cursor: 'pointer', fontSize: 14 }}>
              + Adicionar setor
            </button>
          </div>
        )}

        {/* ── STEP 4: Tipos ── */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 style={{ fontSize: 20, fontWeight: 800, color: C.ink, marginBottom: 4 }}>Tipos de checklist</h2>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>
              Defina os tipos de checklist da sua operação. Não se limite a Abertura e Fechamento — adicione qualquer tipo que faça sentido para seu negócio.
            </p>
            <div className="space-y-3">
              {types.map((t, i) => (
                <div key={t.id} className="flex items-center gap-2">
                  <input value={t.name} onChange={e => setTypes(prev => prev.map(x => x.id === t.id ? { ...x, name: e.target.value } : x))}
                    placeholder={`Tipo ${i + 1}`}
                    style={{ flex: 1, fontSize: 14, fontWeight: 600, color: C.ink, background: 'white', padding: '12px 14px',
                      border: `1.5px solid ${C.border}`, borderRadius: 10, outline: 'none', fontFamily: 'inherit' }} />
                  {types.length > 1 && (
                    <button onClick={() => setTypes(prev => prev.filter(x => x.id !== t.id))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 18, padding: '0 4px' }}>×</button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={() => setTypes(prev => [...prev, { id: uid(), name: '' }])}
              style={{ width: '100%', padding: '12px', borderRadius: 10, border: `2px dashed ${C.border}`, fontWeight: 700, color: C.muted, background: 'none', cursor: 'pointer', fontSize: 14 }}>
              + Adicionar tipo
            </button>
            <div style={{ background: '#F0FAF4', borderRadius: 10, padding: '12px 16px', border: `1px solid ${C.success}30` }}>
              <p style={{ fontSize: 12, color: C.success, fontWeight: 700 }}>💡 Exemplos por segmento</p>
              <p style={{ fontSize: 11, color: C.muted, marginTop: 4, lineHeight: 1.6 }}>
                Restaurante: Abertura · Mise en place · Pré-serviço · Fechamento<br/>
                Hotel: Abertura · Check-in · Vistoria · Manutenção · Fechamento<br/>
                Varejo: Abertura · Conferência · Reposição · Fechamento
              </p>
            </div>
          </div>
        )}

        {/* ── STEP 5: Gestor ── */}
        {step === 5 && (
          <div className="space-y-4">
            <h2 style={{ fontSize: 20, fontWeight: 800, color: C.ink, marginBottom: 4 }}>Conta do gestor</h2>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>Crie a conta principal de acesso à plataforma.</p>

            <Input label="Nome do gestor" value={gestorName} onChange={setGestorName} placeholder="Ex: João Silva" />

            <div>
              <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, marginBottom: 6 }}>PIN de acesso (4 dígitos)</p>
              <input type="tel" inputMode="numeric" maxLength={4} value={gestorPin}
                onChange={e => setGestorPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="••••"
                style={{ width: '100%', fontSize: 24, fontWeight: 800, letterSpacing: '0.5em', color: C.ink,
                  background: 'white', padding: '12px 14px', border: `1.5px solid ${C.border}`, borderRadius: 10, outline: 'none', textAlign: 'center' }} />
            </div>

            <div>
              <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, marginBottom: 6 }}>Confirmar PIN</p>
              <input type="tel" inputMode="numeric" maxLength={4} value={gestorPin2}
                onChange={e => setGestorPin2(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="••••"
                style={{ width: '100%', fontSize: 24, fontWeight: 800, letterSpacing: '0.5em', color: C.ink,
                  background: 'white', padding: '12px 14px', border: `1.5px solid ${gestorPin2 && gestorPin !== gestorPin2 ? C.critical : C.border}`, borderRadius: 10, outline: 'none', textAlign: 'center' }} />
              {gestorPin2 && gestorPin !== gestorPin2 && (
                <p style={{ fontSize: 11, color: C.critical, fontWeight: 700, marginTop: 4 }}>PINs não coincidem</p>
              )}
            </div>

            {/* Resumo */}
            <div style={{ background: 'white', borderRadius: 12, padding: 16, border: `1px solid ${C.border}` }}>
              <p style={{ fontSize: 12, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Resumo da configuração</p>
              <div className="space-y-2">
                <div className="flex justify-between"><span style={{ fontSize: 13, color: C.muted }}>Empresa</span><span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{companyName}</span></div>
                <div className="flex justify-between"><span style={{ fontSize: 13, color: C.muted }}>Lojas</span><span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{units.filter(u => u.name.trim()).length}</span></div>
                <div className="flex justify-between"><span style={{ fontSize: 13, color: C.muted }}>Setores</span><span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{sectors.filter(s => s.name.trim()).length}</span></div>
                <div className="flex justify-between"><span style={{ fontSize: 13, color: C.muted }}>Tipos de checklist</span><span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{types.filter(t => t.name.trim()).length}</span></div>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <p style={{ fontSize: 13, fontWeight: 700, color: C.critical, marginTop: 16, textAlign: 'center' }}>{error}</p>
        )}

        {/* Navigation */}
        <div className="flex gap-3" style={{ marginTop: 32 }}>
          {step > 1 && (
            <button onClick={() => setStep(s => s - 1)}
              style={{ flex: 1, padding: '14px', borderRadius: 12, border: `1.5px solid ${C.border}`, fontWeight: 800, color: C.ink, background: 'white', cursor: 'pointer', fontSize: 15 }}>
              ← Voltar
            </button>
          )}
          <button onClick={goNext} disabled={saving}
            style={{ flex: 2, padding: '14px', borderRadius: 12, border: 'none', fontWeight: 800,
              color: 'white', background: saving ? C.muted : C.ink, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 15 }}>
            {saving ? 'Criando...' : step === 5 ? 'Criar empresa →' : 'Próximo →'}
          </button>
        </div>

        <p style={{ fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 24 }}>
          Já tem uma conta? <a href="/app" style={{ color: C.ink, fontWeight: 700 }}>Acessar o app</a>
        </p>
      </div>
    </div>
  );
}
