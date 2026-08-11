'use client';

/**
 * Histórico de notificações — a única superfície de `notification_log`.
 *
 * Vivia dentro da `PainelView`. Ganhou módulo próprio quando a consolidação
 * levou o Painel para `PainelConsolidado` e a `PainelView` ficou inalcançável:
 * sem isto o bloco teria simplesmente sumido do produto, e quem RECEBE o push de
 * atraso (gerência e liderança) deixaria de poder conferir o que foi enviado.
 *
 * REGRA: não pode importar de `app/`.
 */

import React, { useState, useEffect } from 'react';
import { Bell, ChevronRight } from 'lucide-react';
import { C, W } from '../../lib/tokens';
import { dateStrOf, tzOf } from '../../lib/dates';

/* ── Histórico de notificações ──────────────────────────────────────────────
 *
 * A fonte é `notification_log` (migration 20260729): uma linha por notificação
 * entregue, com empresa, loja, tipo, hora real e quantos aparelhos receberam.
 *
 * A fonte ANTIGA era `config`, lendo as chaves `notified_<data>` — que não são
 * histórico nenhum: são a chave de deduplicação da edge function, um array de
 * ids por dia. Dali saíam quatro defeitos: hora falsa (a do último upsert do
 * dia, repetida em todas as linhas), ids de OUTRAS empresas caindo na lista
 * como "Checklist removido" (a chave é global), nenhum tipo além de atraso, e
 * nenhuma contagem de entrega. A leitura legada continua aqui como segunda
 * fonte enquanto a notify-overdue v9 não estiver deployada — depois disso ela
 * some sozinha, porque as chaves velhas saem da janela de 7 dias.
 *
 * Erro NÃO é mais silencioso: antes um `console.warn` deixava a tela dizendo
 * "Nenhuma notificação enviada" quando na verdade a leitura tinha falhado (foi
 * assim que o painel passou semanas vazio, sem policy para `authenticated`).
 */
export function NotificationHistory({ templates, units, last7, unit }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [log, setLog] = useState([]);

  const tz = tzOf(unit);
  // `last7` é um array novo a cada render do painel (lastDays roda toda vez).
  // A dependência precisa ser o CONTEÚDO, não a identidade — senão o efeito
  // dispara em todo render e a aba vira um laço de consultas.
  const dias = last7.join(',');

  const loadLog = React.useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const supabase = (await import('../../lib/supabase')).authedSupabase();
      const janela = dias.split(',');
      const desde = janela[0];   // primeiro dos 7 dias, no relógio da loja base
      const entradas = [];
      let falhaReal = null;

      // ── Fonte atual ────────────────────────────────────────────────────────
      const { data: rows, error: eLog } = await supabase
        .from('notification_log')
        .select('id, unit_id, kind, title, body, template_id, sector, deadline, targets, delivered, created_at')
        .gte('created_at', `${desde}T00:00:00`)
        .order('created_at', { ascending: false })
        .limit(200);

      // Tabela ainda não criada (migration pendente) não é erro de tela — é o
      // estado esperado até a migration rodar, e a fonte legada cobre. Qualquer
      // outro erro (permissão, rede) precisa aparecer.
      const tabelaAusente = eLog && /42P01|PGRST205|does not exist/i.test(`${eLog.code} ${eLog.message}`);
      if (eLog && !tabelaAusente) falhaReal = eLog.message;

      for (const r of (rows || [])) {
        entradas.push({
          chave: `${dateStrOf(new Date(r.created_at), tz)}|${r.template_id || r.id}`,
          kind: r.kind,
          titulo: r.template_id
            ? (templates.find(t => t.id === r.template_id)?.name || r.body || r.title)
            : r.title,
          detalhe: r.template_id ? [r.sector, r.deadline && `prazo ${r.deadline}`].filter(Boolean).join(' · ') : r.body,
          unitId: r.unit_id,
          targets: r.targets,
          delivered: r.delivered,
          quando: r.created_at,
          precisa: true,
        });
      }

      // ── Fonte legada (`config.notified_<data>`) ────────────────────────────
      const { data: cfg, error: eCfg } = await supabase
        .from('config')
        .select('key, value, updated_at')
        .in('key', janela.map(d => `notified_${d}`));
      if (eCfg && !falhaReal) falhaReal = eCfg.message;

      const vistas = new Set(entradas.map(e => e.chave));
      for (const row of (cfg || [])) {
        const date = row.key.replace('notified_', '');
        let ids = [];
        try { ids = JSON.parse(row.value || '[]'); } catch { ids = []; }
        for (const id of ids) {
          const tpl = templates.find(t => t.id === id);
          // Id que não é desta empresa: a chave `notified_` é global, e era daí
          // que vinham as linhas "Checklist removido" do painel antigo.
          if (!tpl) continue;
          const chave = `${date}|${id}`;
          if (vistas.has(chave)) continue;
          vistas.add(chave);
          entradas.push({
            chave, kind: 'atraso',
            titulo: tpl.name,
            detalhe: [tpl.sector, tpl.deadline && `prazo ${tpl.deadline}`].filter(Boolean).join(' · '),
            unitId: tpl.unitId,
            quando: row.updated_at,
            precisa: false,   // hora aproximada: é o último upsert do dia
          });
        }
      }

      if (falhaReal) { setErro(falhaReal); setLog([]); }
      else {
        entradas.sort((a, b) => String(b.quando).localeCompare(String(a.quando)));
        setLog(entradas);
      }
    } catch (e) {
      setErro(e?.message || 'Não foi possível carregar o histórico.');
    }
    setLoading(false);
  }, [templates, dias, tz]);

  // Carrega junto com o painel: sem isso o cabeçalho não tem como dizer quantas
  // notificações existem, e "não aparece nada" vira dúvida sobre se saiu aviso.
  useEffect(() => { loadLog(); }, [loadLog]);

  const lojaDe = (unitId) => units.find(u => u.id === unitId);
  // `incompleto` nasceu na v11 da notify-overdue. Sem entrada aqui, o histórico
  // mostraria a chave crua ("incompleto") como se fosse rótulo.
  const KIND_LABEL = { atraso: 'Atraso', incompleto: 'Entregue incompleto', cadastro: 'Cadastro' };

  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between w-full px-3 py-2"
        style={{ background: 'white', border: `1.5px solid ${C.border}`, borderRadius: 10, cursor: 'pointer' }}
      >
        <div className="flex items-center gap-2">
          <Bell size={15} color={erro ? C.critical : C.muted} />
          <span style={{ fontSize: 13, fontWeight: W.semibold, color: C.ink }}>Histórico de notificações</span>
          {!loading && !erro && (
            <span style={{ fontSize: 11, color: C.muted }}>
              {log.length === 0 ? 'nenhuma em 7 dias' : `${log.length} em 7 dias`}
            </span>
          )}
          {erro && <span style={{ fontSize: 11, color: C.critical, fontWeight: W.semibold }}>erro ao carregar</span>}
        </div>
        <ChevronRight size={15} color={C.muted} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      {open && (
        <div className="mt-2 space-y-2" style={{ paddingBottom: 8 }}>
          {loading && <p style={{ fontSize: 13, color: C.muted, padding: '8px 4px' }}>Carregando...</p>}

          {!loading && erro && (
            <div className="px-3 py-2" style={{ background: `${C.critical}0F`, border: `1px solid ${C.critical}55`, borderRadius: 8 }}>
              <p style={{ fontSize: 12, color: C.critical, fontWeight: W.semibold }}>Não foi possível ler o histórico.</p>
              <p style={{ fontSize: 11, color: C.muted, marginTop: 2, wordBreak: 'break-word' }}>{erro}</p>
              <button onClick={loadLog} className="mt-2 px-2 py-1"
                style={{ fontSize: 11, fontWeight: W.semibold, color: C.ink, background: 'white', border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer' }}>
                Tentar de novo
              </button>
            </div>
          )}

          {!loading && !erro && log.length === 0 && (
            <div style={{ padding: '8px 4px' }}>
              <p style={{ fontSize: 13, color: C.muted }}>Nenhuma notificação enviada nos últimos 7 dias.</p>
              <p style={{ fontSize: 11, color: C.mutedLight, marginTop: 4 }}>
                Entram aqui os avisos de checklist atrasado e as confirmações de cadastro que chegaram a algum aparelho. Sem ninguém com notificação ativa, nada é enviado — e nada aparece.
              </p>
            </div>
          )}

          {!loading && !erro && log.map((entry) => {
            const loja = lojaDe(entry.unitId);
            return (
              <div key={entry.chave} className="flex items-start gap-3 px-3 py-2"
                style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: loja?.color || unit.color, marginTop: 5, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="flex items-center justify-between gap-2">
                    <p style={{ fontSize: 12, fontWeight: W.semibold, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.titulo}
                    </p>
                    <span style={{ fontSize: 10, color: C.muted, flexShrink: 0, fontWeight: W.semibold }}>
                      {KIND_LABEL[entry.kind] || entry.kind}{loja ? ` · ${loja.name}` : entry.unitId ? ` · ${entry.unitId}` : ''}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p style={{ fontSize: 11, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.detalhe || '—'}
                    </p>
                    <p style={{ fontSize: 10, color: C.muted, flexShrink: 0 }}>
                      {entry.precisa ? '' : '~'}
                      {new Date(entry.quando).toLocaleString('pt-BR', { timeZone: tz, day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
                    </p>
                  </div>
                  {entry.delivered != null && entry.targets != null && (
                    <p style={{ fontSize: 10, color: entry.delivered < entry.targets ? C.warning : C.mutedLight, marginTop: 2 }}>
                      {entry.delivered} de {entry.targets} aparelho{entry.targets === 1 ? '' : 's'}
                      {entry.delivered < entry.targets ? ' — o resto não recebeu (inscrição expirada)' : ''}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
