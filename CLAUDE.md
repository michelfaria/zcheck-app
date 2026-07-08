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
- `zcheckapp.com/entrar` → página de código da empresa
- `ilhabelarepublic.zcheckapp.com/app` → app IBR

## Arquivos principais (dentro de `ibr-checklists-app/`)

```
app/page.js              → landing page
app/entrar/page.js       → página de código da empresa
app/app/page.js          → app principal (5800+ linhas)
app/cadastro/page.js     → solicitação de acesso
app/layout.js            → layout global
app/globals.css          → estilos globais (com @tailwind)
lib/tenant.js            → detecção de tenant por hostname
middleware.js            → redireciona subdomínios para /app
public/zcheck-logo.png   → logo horizontal 400x100px transparente
public/ibr-logo.png      → logo IBR 200x200px
public/manifest.json     → PWA, start_url: /app
```

## Design tokens (app/app/page.js)

```js
const C = {
  bg: '#F7F9FB',
  ink: '#063C5C',
  border: '#E2EAF0',
  muted: '#6B8299',
  mutedLight: '#A8BCC8',
  critical: '#D1462F',
  success: '#31C85A',
  pending: '#6B8299',
};
```

## Cores da landing page

- Azul principal: `#063C5C` · Verde: `#31C85A` · Texto: `#102A3A`
- Fundo: `#F7FAFC` · Bordas: `#E5E7EB` · Texto secundário: `#64748B`

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
