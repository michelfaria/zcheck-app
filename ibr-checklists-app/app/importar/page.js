'use client';

import { useState, useEffect, useRef } from 'react';
import { AlertTriangle, Check, FolderOpen } from 'lucide-react';
import { authedSupabase, setSessionToken } from '../../lib/supabase';
import { validatePin, fetchPublicUsers, fetchCompany } from '../../lib/sync';
import { getTenantSlug } from '../../lib/tenant';
// Mesmo parser do modal dentro do app (Gerenciar > Importar). Antes esta página
// tinha uma cópia própria, com 7 colunas e split(',') cru: o modelo baixado do
// app (12 colunas, texto entre aspas) entrava com os campos trocados.
import { parseImportCSV, buildModelCsv, csvNorm, CSV_COLUMNS } from '../../lib/csvImport';

import { C } from '../../lib/tokens';
// Quem pode importar é quem pode gerenciar templates dentro do app (ROLE_TABS).
const IMPORT_ROLES = ['gerencia', 'gestao'];

const db = () => authedSupabase();

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
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.ink, marginBottom: 4 }}>Importar via CSV</h1>
        <p style={{ fontSize: 13, color: C.muted, marginBottom: 24 }}>
          {company ? `${company.name} · ` : ''}Entre com um perfil de gestão.
        </p>

        {users === null ? (
          <p style={{ fontSize: 13, color: C.muted }}>Carregando…</p>
        ) : users.length === 0 ? (
          <p style={{ fontSize: 13, color: C.muted }}>Nenhum perfil de gestão disponível.</p>
        ) : (
          <>
            <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, marginBottom: 6 }}>Usuário</p>
            <select value={selectedId} onChange={e => { setSelectedId(e.target.value); setError(''); }} style={{ ...box, marginBottom: 16, fontWeight: 700 }}>
              <option value="">Selecione…</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>

            <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, marginBottom: 6 }}>PIN</p>
            <input type="password" inputMode="numeric" maxLength={4} value={pin} autoComplete="off"
              onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') submit(); }}
              placeholder="••••"
              style={{ ...box, textAlign: 'center', letterSpacing: '0.5em', fontSize: 22, fontWeight: 700 }} />

            {error && <p style={{ fontSize: 12, color: C.critical, fontWeight: 700, marginTop: 8 }}>{error}</p>}

            <button onClick={submit} disabled={loading || !selectedId || pin.length !== 4}
              style={{ marginTop: 16, width: '100%', padding: '13px', borderRadius: 10, border: 'none', fontWeight: 600, fontSize: 14,
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
  const [units, setUnits] = useState([]);
  const [csvText, setCsvText] = useState('');
  const [preview, setPreview] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [parseError, setParseError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileRef = useRef(null);

  // As lojas da empresa entram já no login: o modelo é gerado com a loja e o
  // setor REAIS, e a mensagem de erro consegue listar o que existe.
  useEffect(() => {
    if (!user?.companyId) return;
    let cancelled = false;
    (async () => {
      const [{ data: us }, { data: ss }] = await Promise.all([
        db().from('units').select('id, name').eq('company_id', user.companyId),
        db().from('sectors').select('name, unit_id').eq('company_id', user.companyId),
      ]);
      if (cancelled) return;
      setUnits((us || []).map(u => ({
        ...u,
        sectors: (ss || []).filter(s => s.unit_id === u.id).map(s => s.name),
      })));
    })().catch(() => {});
    return () => { cancelled = true; };
  }, [user?.companyId]);

  const knownUnits = units.map(u => u.name).join(', ');

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
    setWarnings([]);
    const result = parseImportCSV(text || csvText);
    setWarnings(result.warnings || []);
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
      // Nome normalizado: "loja 1", "Loja 1" e "LOJA 1" casam com a mesma loja.
      const unitMap = new Map(units.map(u => [csvNorm(u.name), u]));

      let created = 0, skipped = 0;
      const problems = [];

      for (const tpl of preview) {
        const unitRow = unitMap.get(csvNorm(tpl.unitName));
        if (!unitRow) {
          problems.push(`"${tpl.name}": a loja "${tpl.unitName}" não existe. Lojas cadastradas: ${knownUnits || '—'}.`);
          skipped++; continue;
        }

        // Check if template already exists
        const { data: existing } = await db().from('templates')
          .select('id').eq('company_id', companyId).eq('unit_id', unitRow.id)
          .eq('sector', tpl.sector).eq('name', tpl.name).limit(1);

        if (existing?.length) {
          problems.push(`"${tpl.name}": já existe em ${unitRow.name} / ${tpl.sector}.`);
          skipped++; continue;
        }

        const { error } = await db().from('templates').insert({
          id: tpl.id, company_id: companyId, unit_id: unitRow.id,
          sector: tpl.sector, name: tpl.name,
          shift: csvNorm(tpl.name).includes('abertura') ? 'Manhã'
            : csvNorm(tpl.name).includes('fechamento') ? 'Tarde'
            : ['Manhã', 'Tarde'],
          deadline: tpl.deadline,
          items: tpl.items,
        });

        // O erro do banco era descartado: tudo virava "ignorado" sem motivo.
        if (error) { problems.push(`"${tpl.name}": ${error.message}`); skipped++; continue; }
        created++;

        const setores = unitRow.sectors || [];
        if (setores.length && !setores.some(s => csvNorm(s) === csvNorm(tpl.sector))) {
          problems.push(`"${tpl.name}" foi criado, mas o setor "${tpl.sector}" não existe em ${unitRow.name} — crie o setor no app para ele aparecer em Executar.`);
        }
      }

      setImportResult({ created, skipped, total: preview.length, problems });
    } catch (e) {
      console.error(e);
      setImportResult({ error: `Erro durante importação: ${e?.message || 'verifique o console.'}` });
    }
    setImporting(false);
  };

  const downloadTemplate = () => {
    const u = units[0];
    const csv = buildModelCsv({ loja: u?.name || undefined, setor: u?.sectors?.[0] || undefined });
    // BOM: sem ele o Excel abre "Salão" como "SalÃ£o".
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'zcheck-modelo.csv';
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
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.ink, marginTop: 16, marginBottom: 4 }}>Importar via CSV</h1>
          <p style={{ fontSize: 13, color: C.muted }}>Importe checklists e tarefas em lote a partir de uma planilha.</p>
        </div>

        {/* Sessão */}
        <div style={{ marginBottom: 24, background: 'white', borderRadius: 10, padding: '12px 16px', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <p style={{ fontSize: 13, color: C.muted }}>
            Importando como <strong style={{ color: C.ink }}>{user.name}</strong>
          </p>
          <button onClick={logout}
            style={{ background: 'none', border: 'none', color: C.muted, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer' }}>
            Sair
          </button>
        </div>

        {/* Download template */}
        <div style={{ background: 'white', borderRadius: 12, padding: 20, border: `1px solid ${C.border}`, marginBottom: 24 }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 4 }}>Modelo de planilha</p>
              <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
                Baixe o modelo CSV, preencha com seus checklists e importe abaixo.
                Cada linha de <strong>checklist</strong> cria um novo checklist.
                Cada linha de <strong>tarefa</strong> é um item do checklist acima.
                O modelo já vem com a sua loja{knownUnits ? ` (${knownUnits})` : ''} — aceita separador
                vírgula, ponto e vírgula ou tabulação, então pode salvar direto do Excel, do Numbers
                ou do Google Sheets.
              </p>
            </div>
            <button onClick={downloadTemplate}
              style={{ padding: '10px 16px', borderRadius: 8, background: C.ink, color: 'white', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>
              ↓ Baixar modelo
            </button>
          </div>

          <div style={{ marginTop: 16, background: C.bg, borderRadius: 8, padding: 12, fontFamily: 'monospace', fontSize: 11, color: C.muted, overflowX: 'auto' }}>
            <pre style={{ margin: 0 }}>{[CSV_COLUMNS.join(','), ...buildModelCsv({
              loja: units[0]?.name || undefined,
              setor: units[0]?.sectors?.[0] || undefined,
            }).split('\r\n').slice(1, 4)].join('\n')}</pre>
          </div>
        </div>

        {/* Upload / paste */}
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, marginBottom: 8 }}>Arquivo CSV</p>
          <div className="flex gap-3" style={{ marginBottom: 12 }}>
            <button onClick={() => fileRef.current?.click()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 20px', borderRadius: 8, background: 'white', color: C.ink, border: `1.5px solid ${C.border}`, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              <FolderOpen size={15} aria-hidden /> Selecionar arquivo
            </button>
            <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={handleFile} />
            <span style={{ fontSize: 12, color: C.muted, alignSelf: 'center' }}>ou cole o conteúdo abaixo</span>
          </div>
          <textarea value={csvText} onChange={e => setCsvText(e.target.value)} placeholder="Cole o conteúdo CSV aqui..."
            rows={8}
            style={{ width: '100%', fontSize: 12, color: C.ink, background: 'white', padding: '12px 14px', fontFamily: 'monospace',
              border: `1.5px solid ${C.border}`, borderRadius: 10, outline: 'none', resize: 'vertical' }} />
          <button onClick={() => handleParse(csvText)} disabled={!csvText.trim()}
            style={{ marginTop: 8, padding: '10px 20px', borderRadius: 8, background: C.ink, color: 'white', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: csvText.trim() ? 1 : 0.5 }}>
            Pré-visualizar
          </button>
        </div>

        {/* Parse error */}
        {parseError && (
          <div style={{ background: '#FFF3F0', border: `1px solid ${C.critical}`, borderRadius: 10, padding: '12px 16px', marginBottom: 24 }}>
            <p style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 13, fontWeight: 700, color: C.critical }}><AlertTriangle size={14} aria-hidden style={{ flexShrink: 0, marginTop: 1 }} /> {parseError}</p>
          </div>
        )}

        {/* Linhas descartadas na leitura — antes sumiam em silêncio. */}
        {warnings.length > 0 && (
          <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 16px', marginBottom: 24 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: C.ink, marginBottom: 4 }}>Avisos na leitura do arquivo</p>
            {warnings.map((w, i) => (
              <p key={i} style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>• {w}</p>
            ))}
          </div>
        )}

        {/* Preview */}
        {preview && (
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, marginBottom: 12 }}>
              Pré-visualização — {preview.length} checklist{preview.length !== 1 ? 's' : ''} encontrado{preview.length !== 1 ? 's' : ''}
            </p>
            <div className="space-y-3">
              {preview.map(tpl => (
                <div key={tpl.id} style={{ background: 'white', borderRadius: 10, padding: 16, border: `1px solid ${C.border}` }}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p style={{ fontWeight: 600, color: C.ink, fontSize: 14 }}>{tpl.name}</p>
                      <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                        {tpl.unitName} · {tpl.sector}{tpl.deadline ? ` · até ${tpl.deadline}` : ''}
                      </p>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.muted, flexShrink: 0 }}>{tpl.items.length} itens</span>
                  </div>
                  {tpl.items.length > 0 && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                      {tpl.items.slice(0, 3).map(item => (
                        <p key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 5, fontSize: 12, color: item.critical ? C.critical : C.muted, marginBottom: 3 }}>
                          {item.critical
                            ? <AlertTriangle size={12} aria-label="Crítico" style={{ flexShrink: 0, marginTop: 2 }} />
                            : <span aria-hidden style={{ flexShrink: 0 }}>·</span>}
                          {item.text}
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
              style={{ marginTop: 16, width: '100%', padding: '14px', borderRadius: 12, border: 'none', fontWeight: 600,
                color: 'white', background: importing ? C.muted : C.success, cursor: importing ? 'not-allowed' : 'pointer', fontSize: 15 }}>
              {importing ? 'Importando...' : `Importar ${preview.length} checklist${preview.length !== 1 ? 's' : ''} →`}
            </button>
          </div>
        )}

        {/* Import result */}
        {importResult && (
          <div style={{ background: (importResult.error || !importResult.created) ? '#FFF3F0' : '#F0FAF4', border: `1px solid ${(importResult.error || !importResult.created) ? C.critical : C.success}`, borderRadius: 12, padding: 20 }}>
            {importResult.error
              ? <p style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 14, fontWeight: 700, color: C.critical }}><AlertTriangle size={15} aria-hidden style={{ flexShrink: 0, marginTop: 1 }} /> {importResult.error}</p>
              : (
                <>
                  {/* "Concluída!" só quando algo entrou de fato — antes dizia isso
                      mesmo com 0 criados, contradizendo o próprio número abaixo. */}
                  <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 16, fontWeight: 600, color: importResult.created ? C.success : C.critical, marginBottom: 8 }}>
                    {importResult.created
                      ? <><Check size={17} aria-hidden /> Importação concluída!</>
                      : 'Nenhum checklist foi importado'}
                  </p>
                  <p style={{ fontSize: 13, color: C.muted }}>
                    <strong style={{ color: C.ink }}>{importResult.created}</strong> checklist{importResult.created !== 1 ? 's' : ''} criado{importResult.created !== 1 ? 's' : ''}
                    {importResult.skipped > 0 && <> · <strong style={{ color: C.muted }}>{importResult.skipped}</strong> ignorado{importResult.skipped !== 1 ? 's' : ''}</>}
                  </p>
                  {/* O motivo de cada checklist que não entrou (ou que entrou torto). */}
                  {importResult.problems?.length > 0 && (
                    <div style={{ marginTop: 10, background: 'white', border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px' }}>
                      {importResult.problems.map((p, i) => (
                        <p key={i} style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>• {p}</p>
                      ))}
                    </div>
                  )}
                  <a href="/app" style={{ display: 'inline-block', marginTop: 16, padding: '10px 24px', background: C.ink, color: 'white', borderRadius: 8, fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>
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
