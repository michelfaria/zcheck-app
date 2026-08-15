# ZCheck — Contexto do projeto

App de checklists multi-tenant (SaaS). Landing page + app por subdomínio de empresa.

## Infraestrutura

- Domínio: `zcheckapp.com` (GoDaddy) — DNS A `76.76.21.21`, CNAME `*.zcheckapp.com → cname.vercel-dns.com`
- Vercel: org `ilhabelarepublic`, projeto `ibr-checklists-app`
- Supabase: `https://rjuulamozdhssgqrzfji.supabase.co`
- GitHub: `https://github.com/michelfaria/zcheck-app.git` (público)
- WhatsApp contato: `https://wa.me/5512988017472`

## URLs ativas

- `zcheckapp.com` → landing page
- `zcheckapp.com/lista` → waitlist (grava na tabela `waitlist`; leads lidos só no SQL Editor)
- `zcheckapp.com/entrar` → página de código da empresa
- `ilhabelarepublic.zcheckapp.com/app` → app IBR

## Arquivos principais (dentro de `ibr-checklists-app/`)

```
app/page.js                      → landing page (tokens; CTA = waitlist /lista)
app/lista/page.js                → formulário do waitlist
app/entrar/page.js               → página de código da empresa
app/app/page.js                  → app principal (~10.200 linhas)
components/painel/               → a aba Painel consolidada (Painel+J.I.T.+Dados)
  PainelConsolidado.js           → a aba: Agora, Dia, Rede, faixa 7d, Período
  ReportsView.js                 → o corpo analítico (ReportsBody) + conferência
  useRelatorio.js                → motor de filtro/derivados + exportCSV/exportPDF
  agora.js                       → blocos do registro AGORA (Painel E pop-up)
  JitPanel.js                    → buildJit + o pop-up de briefing
  shared.js, context.js, NotificationHistory.js
app/cadastro/page.js             → pedido de PIN de colaborador (não cria empresa)
app/onboarding/page.js           → cria empresa via /api/admin/provision (exige chave)
app/importar/page.js             → importa CSV (exige PIN de gerência/gestão)
app/api/auth/session/route.js    → PIN → JWT assinado com o segredo do Supabase
app/api/admin/provision/route.js → provisiona empresa (service_role, server-only)
app/layout.js                    → layout global
app/globals.css                  → estilos globais (@tailwind + CSS vars dos tokens)
lib/tokens.js                    → FONTE ÚNICA de cor/raio/peso/tamanho (C/R/W/T)
lib/dates.js                     → FONTE ÚNICA do "dia de operação" (fuso POR LOJA, units.timezone)
lib/library.js                   → biblioteca de checklists prontos por setor
lib/serverAuth.js                → assina o token de sessão (NUNCA importar no cliente)
lib/tenant.js                    → detecção de tenant por hostname
middleware.js                    → redireciona subdomínios para /app
public/zcheck-logo.png           → logo horizontal 400x100px transparente
public/manifest.json             → PWA, start_url: /app
```

## Design tokens

Fonte única em `lib/tokens.js` (objeto `C` de cores + `R` raio + `W` peso +
`T` tamanho), espelhados como CSS vars em `globals.css`. A landing consome os
MESMOS tokens desde 10/07/2026 — não existe mais paleta própria da landing.
Toda cor de texto foi medida contra o fundo e passa WCAG AA; ao mudar um valor,
meça de novo (instruções e números no cabeçalho do próprio tokens.js).

## Mapeamento de empresas (app/entrar/page.js)

```js
const EMPRESAS = {
  'ilhabelarepublic': 'ilhabelarepublic',
  'ibr': 'ilhabelarepublic',
};
```

## Pendências prioritárias (estado 28/06/2026)

1. Logo unificado — landing page `height: 32px`, login `width: 200px` — alinhar tamanho
2. Ícones dos cards de benefícios na landing page — cada um com ícone diferente
3. Identidade visual interna — app ainda com estilo antigo; não aplicar sem cuidado (quebrou antes)
4. Login email+senha para contas de gestão
5. Empresas no Supabase — tirar o mapeamento hardcoded de `entrar/page.js`
6. Página `/entrar` — link no header da landing page apontando para ela (botão "Acessar" já aponta)

## Regras importantes

- Sempre ler antes de editar — ver o trecho exato antes de fazer replace
- Data: NUNCA `toISOString().slice(0,10)` para o dia de operação — devolve UTC e
  vira o dia seguinte depois das 21h em Brasília. Usar sempre `lib/dates.js`
- O dia é o do RELÓGIO DA LOJA: `todayStr(tzOf(unit))`, nunca `todayStr()` solto.
  Prazo de checklist é `instantAt(data, hora, tz)` — comparar com `new Date()`
  usa o fuso de quem abriu o painel, não o da loja que executou
- `globals.css` deve ter `@tailwind` — se quebrar, restaurar com `git show HEAD:ibr-checklists-app/app/globals.css`
- git root está em `/Users/michelfaria/Documents/Site ZCheck` — não em `ibr-checklists-app/`
- **Nunca `git add -A` nem `git add .`** — estagiar sempre por caminho. A raiz
  guarda material que não é código (`video-colaboradores/` com 43MB de MP4,
  `_baseline/` com PDFs de desempenho de gente real) e o repositório é PÚBLICO.
  Em 11/08/2026 um `git add -A` varreu 43MB de vídeo untracked para dois commits;
  só foi pego lendo o resumo do merge, antes do push. Binário em git é
  permanente: `git rm` depois não tira do histórico nem encolhe o clone.
  Antes de publicar, conferir o que sai:
  `git diff --name-only origin/main..main`
- Não mexer em `borderRadius` globalmente — quebra o layout dos cards
- Deploy: `cd ibr-checklists-app && npx vercel --prod`
- `ibr-checklists-app-codex-update/` é uma cópia paralela — o projeto ativo é `ibr-checklists-app/`

## Antes de publicar

```bash
cd ibr-checklists-app && npm run verify   # eslint --quiet && npm run test && next build
```

`verify` inclui os testes desde 11/08/2026. `npm run test` roda os cinco de node:

| Teste | O que prova |
|---|---|
| `conferencia.spec.mjs` | ordem da fila de conferência |
| `painel-render.spec.mjs` | **o que aparece e o que NÃO aparece por papel** — é a prova da fronteira de acesso, e conta que o motor analítico não roda para colaborador |
| `prazo-render.spec.mjs` | a régua de prazo **como texto na conferência** — entrega dentro do minuto do prazo não pode virar "atrasado" nem tarja "Fora do prazo", e o prazo é o do relógio da loja |
| `track.spec.mjs` | a fila de telemetria não perde evento em concorrência |
| `appurl.spec.mjs` | aba na URL sobrevive ao login; aliases de abas aposentadas |

Os três últimos montam componentes de verdade (jsdom + esbuild) e **não precisam
de sessão logada** — que é o que impede o Playwright de cobrir tela logada.

`npm run build` NÃO checa variável não declarada — é JS puro, sem tipos, e o
Next não roda lint no build. Em 10/08/2026 um `useMemo` foi publicado com uma
variável inexistente no array de dependências: build limpo, app inteiro fora do
ar por ReferenceError. `verify` roda o lint antes do build; `no-undef` é erro e
bloqueia. Aviso (`no-unused-vars`, `exhaustive-deps`) não bloqueia — veja
`ibr-checklists-app/eslint.config.mjs` para o porquê de cada escolha.

**Build limpo também não prova que a tela renderiza.** Na consolidação de abas
(11/08/2026) três defeitos passaram por lint, build, 71 testes e pela comparação
do PDF exportado — os três eram de RENDERIZAÇÃO, e o PDF lê o motor direto sem
tocar no JSX. Por isso existe `tests/painel-render.spec.mjs`: ele monta os
componentes com `renderToStaticMarkup` e afirma o que aparece **e o que não
aparece** por papel. É lá que mora a prova de que o colaborador não vê bloco de
gestão — mexeu em gate de acesso, rode ele.
