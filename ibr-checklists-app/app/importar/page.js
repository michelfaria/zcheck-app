'use client';

import { useState, useEffect, useRef } from 'react';
import { authedSupabase, setSessionToken } from '../../lib/supabase';
import { validatePin, fetchPublicUsers, fetchCompany } from '../../lib/sync';
import { getTenantSlug } from '../../lib/tenant';

const C = {
  ink: '#063C5C', bg: '#F7F9FB', border: '#E2EAF0',
  muted: '#6B8299', success: '#31C85A', critical: '#D1462F',
};

// Quem pode importar é quem pode gerenciar templates dentro do app (ROLE_TABS).
const IMPORT_ROLES = ['gerencia', 'gestao'];

const uid = () => Math.random().toString(36).slice(2, 10);

const db = () => authedSupabase();

const CSV_TEMPLATE = `tipo,checklist,loja,setor,tarefa,critico,deadline
checklist,Abertura,Loja 1,Salão,,, 08:00
tarefa,Abertura,Loja 1,Salão,Limpar mesas e cadeiras,nao,
tarefa,Abertura,Loja 1,Salão,Abastecer sachês,nao,
tarefa,Abertura,Loja 1,Salão,Verificar caixas registradoras,sim,
checklist,Fechamento,Loja 1,Salão,,,18:00
tarefa,Fechamento,Loja 1,Salão,Fechar caixas,sim,
tarefa,Fechamento,Loja 1,Salão,Limpar salão,nao,
tarefa,Fechamento,Loja 1,Salão,Verificar alarme,sim,`;

function parseCSV(text) {
  const lines = text.trim().split('\n').filter(l => l.trim());
  if (!lines.length) return { error: 'Arquivo vazio.' };

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const required = ['tipo', 'checklist', 'loja', 'setor'];
  const missing = required.filter(r => !headers.includes(r));
  if (missing.length) return { error: `Colunas obrigatórias ausentes: ${missing.join(', ')}` };

  const rows = lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim());
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] || '']));
  });

  // Group into checklists with items
  const checklists = [];
  let current = null;

  for (const row of rows) {
    if (!row.tipo || !row.checklist || !row.loja || !row.setor) continue;

    if (row.tipo === 'checklist') {
      current = {
        id: uid(),
        name: row.checklist.trim(),
        unitName: row.loja.trim(),
        sector: row.setor.trim(),
        deadline: row.deadline?.trim() || null,
        items: [],
      };
      checklists.push(current);
    } else if (row.tipo === 'tarefa' && current) {
      if (!row.tarefa?.trim()) continue;
      current.items.push({
        id: uid(),
        text: row.tarefa.trim(),
        critical: row.critico?.toLowerCase() === 'sim',
      });
    }
  }

  if (!checklists.length) return { error: 'Nenhum checklist encontrado. Verifique o formato.' };
  return { checklists };
}

/**
 * Portão de PIN. Importar template escreve na tabela `templates`, que é escopada
 * por company_id no RLS — sem token não há escrita. A empresa destino deixou de
 * ser escolhida num dropdown: é a do token de quem entrou.
 */
function PinGate({ onAuth }) {
  const [company, setCompany] = useState(null);
  const [users, setUsers] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const slug = getTenantSlug();
    if (!slug) { setUsers([]); return; }
    Promise.all([fetchCompany(slug), fetchPublicUsers(slug)])
      .then(([co, list]) => {
        setCompany(co);
        setUsers((list || []).filter(u => IMPORT_ROLES.includes(u.role)));
      })
      .catch(() => setUsers([]));
  }, []);

  const submit = async () => {
    if (!/^\d{4}$/.test(pin) || !selectedId) return;
    setLoading(true);
    setError('');
    const result = await validatePin(selectedId, pin);
    setLoading(false);
    setPin('');

    if (result.ok && result.token) {
      if (!IMPORT_ROLES.includes(result.user.role)) {
        setError('Seu perfil não pode importar checklists.');
        return;
      }
      setSessionToken(result.token);
      onAuth(result.user);
      return;
    }
    if (result.reason === 'suspended') setError('Acesso suspenso. Entre em contato com a gestão.');
    else if (result.reason === 'rate_limited') setError('Muitas tentativas. Aguarde 10 minutos.');
    else if (result.reason === 'wrong_pin') setError('PIN incorreto.');
    else if (result.reason === 'network_error') setError('Sem conexão. Verifique sua internet.');
    else if (result.reason === 'server_misconfigured') setError('Serviço indisponível. Avise a gestão.');
    else setError('Não foi possível entrar.');
  };

  const box = { width: '100%', fontSize: 14, color: C.ink, background: 'white',
    padding: '12px 14px', border: `1.5px solid ${C.border}`, borderRadius: 10, outline: 'none' };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: C.ink, marginBottom: 4 }}>Importar via CSV</h1>
        <p style={{ fontSize: 13, color: C.muted, marginBottom: 24 }}>
          {company ? `${company.name} · ` : ''}Entre com um perfil de gestão.
        </p>

        {users === null ? (
          <p style={{ fontSize: 13, color: C.muted }}>Carregando…</p>
        ) : users.length === 0 ? (
          <p style={{ fontSize: 13, color: C.muted }}>Nenhum perfil de gestão disponível.</p>
        ) : (
          <>
            <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, marginBottom: 6 }}>Usuário</p>
            <select value={selectedId} onChange={e => { setSelectedId(e.target.value); setError(''); }} style={{ ...box, marginBottom: 16, fontWeight: 700 }}>
              <option value="">Selecione…</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>

            <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, marginBottom: 6 }}>PIN</p>
            <input type="password" inputMode="numeric" maxLength={4} value={pin} autoComplete="off"
              onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') submit(); }}
              placeholder="••••"
              style={{ ...box, textAlign: 'center', letterSpacing: '0.5em', fontSize: 22, fontWeight: 800 }} />

            {error && <p style={{ fontSize: 12, color: C.critical, fontWeight: 700, marginTop: 8 }}>{error}</p>}

            <button onClick={submit} disabled={loading || !selectedId || pin.length !== 4}
              style={{ marginTop: 16, width: '100%', padding: '13px', borderRadius: 10, border: 'none', fontWeight: 800, fontSize: 14,
                color: 'white', background: C.ink, cursor: 'pointer', opacity: loading || !selectedId || pin.length !== 4 ? 0.5 : 1 }}>
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </>
        )}

        <a href="/app" style={{ display: 'block', marginTop: 20, fontSize: 13, color: C.muted, textDecoration: 'none', fontWeight: 700 }}>← Voltar ao app</a>
      </div>
    </div>
  );
}

export default function ImportarPage() {
  const [user, setUser] = useState(null);
  const [csvText, setCsvText] = useState('');
  const [preview, setPreview] = useState(null);
  const [parseError, setParseError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileRef = useRef(null);

  const handleFile = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      setCsvText(ev.target.result);
      handleParse(ev.target.result);
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleParse = (text) => {
    setParseError('');
    setPreview(null);
    setImportResult(null);
    const result = parseCSV(text || csvText);
    if (result.error) { setParseError(result.error); return; }
    setPreview(result.checklists);
  };

  const handleImport = async () => {
    if (!preview?.length) return;
    setImporting(true);
    setImportResult(null);

    try {
      // A empresa é a do token, não uma escolha da tela. O RLS recusaria escrita
      // em qualquer outra, mas passar explicitamente deixa a intenção visível.
      const companyId = user.companyId;

      // Fetch units for the company to match names
      const { data: units } = await db().from('units').select('id, name').eq('company_id', companyId);
      const unitMap = Object.fromEntries((units || []).map(u => [u.name.toLowerCase(), u.id]));

      let created = 0, skipped = 0;

      for (const tpl of preview) {
        const unitId = unitMap[tpl.unitName.toLowerCase()];
        if (!unitId) { skipped++; continue; }

        // Check if template already exists
        const { data: existing } = await db().from('templates')
          .select('id').eq('company_id', companyId).eq('unit_id', unitId)
          .eq('sector', tpl.sector).eq('name', tpl.name).limit(1);

        if (existing?.length) { skipped++; continue; }

        const { error } = await db().from('templates').insert({
          id: tpl.id, company_id: companyId, unit_id: unitId,
          sector: tpl.sector, name: tpl.name,
          shift: tpl.name.toLowerCase().includes('abertura') ? 'Manhã'
            : tpl.name.toLowerCase().includes('fechamento') ? 'Tarde'
            : ['Manhã', 'Tarde'],
          deadline: tpl.deadline,
          items: tpl.items,
        });

        if (!error) created++; else skipped++;
      }

      setImportResult({ created, skipped, total: preview.length });
    } catch (e) {
      console.error(e);
      setImportResult({ error: 'Erro durante importação. Verifique o console.' });
    }
    setImporting(false);
  };

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'zchek-modelo.csv';
    a.click();
  };

  if (!user) return <PinGate onAuth={setUser} />;

  const logout = async () => {
    await setSessionToken(null);
    setUser(null);
  };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 20px 80px' }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <a href="/app" style={{ fontSize: 13, color: C.muted, textDecoration: 'none', fontWeight: 700 }}>← Voltar ao app</a>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: C.ink, marginTop: 16, marginBottom: 4 }}>Importar via CSV</h1>
          <p style={{ fontSize: 13, color: C.muted }}>Importe checklists e tarefas em lote a partir de uma planilha.</p>
        </div>

        {/* Sessão */}
        <div style={{ marginBottom: 24, background: 'white', borderRadius: 10, padding: '12px 16px', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <p style={{ fontSize: 13, color: C.muted }}>
            Importando como <strong style={{ color: C.ink }}>{user.name}</strong>
          </p>
          <button onClick={logout}
            style={{ background: 'none', border: 'none', color: C.muted, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer' }}>
            Sair
          </button>
        </div>

        {/* Download template */}
        <div style={{ background: 'white', borderRadius: 12, padding: 20, border: `1px solid ${C.border}`, marginBottom: 24 }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p style={{ fontSize: 14, fontWeight: 800, color: C.ink, marginBottom: 4 }}>Modelo de planilha</p>
              <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
                Baixe o modelo CSV, preencha com seus checklists e importe abaixo.
                Cada linha de <strong>checklist</strong> cria um novo checklist.
                Cada linha de <strong>tarefa</strong> é um item do checklist acima.
              </p>
            </div>
            <button onClick={downloadTemplate}
              style={{ padding: '10px 16px', borderRadius: 8, background: C.ink, color: 'white', border: 'none', fontWeight: 800, fontSize: 13, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>
              ↓ Baixar modelo
            </button>
          </div>

          <div style={{ marginTop: 16, background: C.bg, borderRadius: 8, padding: 12, fontFamily: 'monospace', fontSize: 11, color: C.muted, overflowX: 'auto' }}>
            <pre style={{ margin: 0 }}>{`tipo,checklist,loja,setor,tarefa,critico,deadline
checklist,Abertura,Loja 1,Salão,,,08:00
tarefa,Abertura,Loja 1,Salão,Limpar mesas,nao,
tarefa,Abertura,Loja 1,Salão,Verificar caixa,sim,`}</pre>
          </div>
        </div>

        {/* Upload / paste */}
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, marginBottom: 8 }}>Arquivo CSV</p>
          <div className="flex gap-3" style={{ marginBottom: 12 }}>
            <button onClick={() => fileRef.current?.click()}
              style={{ padding: '10px 20px', borderRadius: 8, background: 'white', color: C.ink, border: `1.5px solid ${C.border}`, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              📂 Selecionar arquivo
            </button>
            <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={handleFile} />
            <span style={{ fontSize: 12, color: C.muted, alignSelf: 'center' }}>ou cole o conteúdo abaixo</span>
          </div>
          <textarea value={csvText} onChange={e => setCsvText(e.target.value)} placeholder="Cole o conteúdo CSV aqui..."
            rows={8}
            style={{ width: '100%', fontSize: 12, color: C.ink, background: 'white', padding: '12px 14px', fontFamily: 'monospace',
              border: `1.5px solid ${C.border}`, borderRadius: 10, outline: 'none', resize: 'vertical' }} />
          <button onClick={() => handleParse(csvText)} disabled={!csvText.trim()}
            style={{ marginTop: 8, padding: '10px 20px', borderRadius: 8, background: C.ink, color: 'white', border: 'none', fontWeight: 800, fontSize: 13, cursor: 'pointer', opacity: csvText.trim() ? 1 : 0.5 }}>
            Pré-visualizar
          </button>
        </div>

        {/* Parse error */}
        {parseError && (
          <div style={{ background: '#FFF3F0', border: `1px solid ${C.critical}`, borderRadius: 10, padding: '12px 16px', marginBottom: 24 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: C.critical }}>⚠ {parseError}</p>
          </div>
        )}

        {/* Preview */}
        {preview && (
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, marginBottom: 12 }}>
              Pré-visualização — {preview.length} checklist{preview.length !== 1 ? 's' : ''} encontrado{preview.length !== 1 ? 's' : ''}
            </p>
            <div className="space-y-3">
              {preview.map(tpl => (
                <div key={tpl.id} style={{ background: 'white', borderRadius: 10, padding: 16, border: `1px solid ${C.border}` }}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p style={{ fontWeight: 800, color: C.ink, fontSize: 14 }}>{tpl.name}</p>
                      <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                        {tpl.unitName} · {tpl.sector}{tpl.deadline ? ` · até ${tpl.deadline}` : ''}
                      </p>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.muted, flexShrink: 0 }}>{tpl.items.length} itens</span>
                  </div>
                  {tpl.items.length > 0 && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                      {tpl.items.slice(0, 3).map(item => (
                        <p key={item.id} style={{ fontSize: 12, color: item.critical ? C.critical : C.muted, marginBottom: 3 }}>
                          {item.critical ? '⚠ ' : '· '}{item.text}
                        </p>
                      ))}
                      {tpl.items.length > 3 && (
                        <p style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>+{tpl.items.length - 3} mais itens</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button onClick={handleImport} disabled={importing}
              style={{ marginTop: 16, width: '100%', padding: '14px', borderRadius: 12, border: 'none', fontWeight: 800,
                color: 'white', background: importing ? C.muted : C.success, cursor: importing ? 'not-allowed' : 'pointer', fontSize: 15 }}>
              {importing ? 'Importando...' : `Importar ${preview.length} checklist${preview.length !== 1 ? 's' : ''} →`}
            </button>
          </div>
        )}

        {/* Import result */}
        {importResult && (
          <div style={{ background: importResult.error ? '#FFF3F0' : '#F0FAF4', border: `1px solid ${importResult.error ? C.critical : C.success}`, borderRadius: 12, padding: 20 }}>
            {importResult.error
              ? <p style={{ fontSize: 14, fontWeight: 700, color: C.critical }}>⚠ {importResult.error}</p>
              : (
                <>
                  <p style={{ fontSize: 16, fontWeight: 800, color: C.success, marginBottom: 8 }}>✓ Importação concluída!</p>
                  <p style={{ fontSize: 13, color: C.muted }}>
                    <strong style={{ color: C.ink }}>{importResult.created}</strong> checklist{importResult.created !== 1 ? 's' : ''} criado{importResult.created !== 1 ? 's' : ''}
                    {importResult.skipped > 0 && <> · <strong style={{ color: C.muted }}>{importResult.skipped}</strong> ignorado{importResult.skipped !== 1 ? 's' : ''} (já existiam ou loja não encontrada)</>}
                  </p>
                  <a href="/app" style={{ display: 'inline-block', marginTop: 16, padding: '10px 24px', background: C.ink, color: 'white', borderRadius: 8, fontWeight: 800, fontSize: 13, textDecoration: 'none' }}>
                    Ir para o app →
                  </a>
                </>
              )
            }
          </div>
        )}
      </div>
    </div>
  );
}
