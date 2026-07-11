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
app/app/page.js                  → app principal (6900+ linhas)
app/cadastro/page.js             → pedido de PIN de colaborador (não cria empresa)
app/onboarding/page.js           → cria empresa via /api/admin/provision (exige chave)
app/importar/page.js             → importa CSV (exige PIN de gerência/gestão)
app/api/auth/session/route.js    → PIN → JWT assinado com o segredo do Supabase
app/api/admin/provision/route.js → provisiona empresa (service_role, server-only)
app/layout.js                    → layout global
app/globals.css                  → estilos globais (@tailwind + CSS vars dos tokens)
lib/tokens.js                    → FONTE ÚNICA de cor/raio/peso/tamanho (C/R/W/T)
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
- `globals.css` deve ter `@tailwind` — se quebrar, restaurar com `git show HEAD:ibr-checklists-app/app/globals.css`
- git root está em `/Users/michelfaria/Documents/Site ZCheck` — não em `ibr-checklists-app/`
- Não mexer em `borderRadius` globalmente — quebra o layout dos cards
- Deploy: `cd ibr-checklists-app && npx vercel --prod`
- `ibr-checklists-app-codex-update/` é uma cópia paralela — o projeto ativo é `ibr-checklists-app/`
