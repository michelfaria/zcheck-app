# HANDOFF — ZCheck (sessão de self-service + billing + multi-tenant real)

> Documento autossuficiente para retomar o trabalho sem contexto prévio.
> Última atualização: 18/07/2026. Branch **`main`**, HEAD **`42c6f68`** (tudo mergeado e deployado em produção).

---

## 1. Objetivo geral

**ZCheck** é um SaaS multi-tenant de checklists operacionais para operação física
(restaurantes, cafés, hotéis, varejo, padaria). Landing pública + app por
subdomínio de empresa. Cliente-piloto real em produção: **Ilhabela Republic (IBR)**.

Esta sessão entregou, ponta a ponta:
1. **Cadastro self-service** (`/comecar`) — qualquer empresa se cadastra sozinha.
2. **Trial de 7 dias + paywall + cobrança via Mercado Pago** (assinatura recorrente).
3. **Multi-tenant de verdade na interface** — o app era single-tenant com o IBR
   hardcoded; agora renderiza a config da própria empresa e nunca a do IBR.
4. **Onboarding guiado no 1º acesso** (logo, cores, lojas, setores, checklists).
5. Uma bateria de correções de UX/bugs vindas de testes reais no aparelho.

Infra (do `CLAUDE.md`): domínio `zcheckapp.com`; Vercel org `ilhabelarepublic`,
projeto `ibr-checklists-app`; Supabase `rjuulamozdhssgqrzfji`; GitHub
`github.com/michelfaria/zcheck-app` (PÚBLICO). WhatsApp `wa.me/5512988017472`.

**Raiz do repo (git root):** `/Users/michelfaria/Documents/Site ZCheck`.
**Projeto ativo:** subpasta `ibr-checklists-app/`. (Existe `ibr-checklists-app-codex-update/`
como cópia paralela — IGNORAR, o ativo é `ibr-checklists-app/`.)

---

## 2. Estado atual — o que foi concluído

Tudo abaixo está **commitado, deployado e verificado**. Stack: Next.js 15.5.x
(App Router), React 19, `@supabase/supabase-js`, `lucide-react`, `idb-keyval`,
Tailwind. Sem libs de pagamento (integração MP é `fetch` direto na API).

### Migrations (em `ibr-checklists-app/supabase/migrations/`) — APLICADAS À MÃO no SQL Editor
- `20260715_signups.sql` — tabela `signups` (RLS + revoke anon) + guarda de slug
  reservado/curto no RPC `provision_company`.
- `20260716_billing.sql` — colunas de billing em `companies`
  (`subscription_status`, `trial_ends_at`, `plan_tier`, `unit_limit`,
  `current_period_end`, `mp_preapproval_id`); tabela `billing_events`; função
  `company_is_active(text)`; **enforcement no RLS** (predicado `company_is_active`
  no `with check` das tabelas de uso: templates/completions/photos/closures/
  live_tasks/recognitions/action_plans); `provision_company` com trial de 7 dias;
  **backfill do IBR como `active`/cortesia** (nunca vê paywall).
- `20260717_onboarding.sql` — coluna `companies.onboarded_at`; `provision_company`
  deixa de exigir loja (empresa nasce vazia → cai no onboarding); bucket
  **`company-logos`** (leitura pública; escrita só do tenant, path `{company_id}/…`);
  **backfill** de `onboarded_at` para quem já tem lojas (IBR/demo/hotel-teste).

### Novos arquivos em `ibr-checklists-app/lib/`
- `plans.js` — fonte única dos tiers (`starter` R$97/1un, `growth` R$197/3un,
  `scale` R$297/5un; `CUSTOM_TIER` >5) + `billingState(company)` (retorna
  `active`/`trialing`/`expired`) + `getTier`/`getTierByPrice`/`tierForUnits`.
- `mercadopago.js` — server-only: `createPreapproval`, `getPreapproval`,
  `getAuthorizedPayment`, `cancelPreapproval`, `verifyWebhookSignature` (x-signature).
- `signupServer.js` — helpers das rotas de signup (`serviceClient`, `hashSecret`
  HMAC c/ `SUPABASE_JWT_SECRET`, `sixDigitCode`, `randomToken`, `clientIp`,
  limites de rate-limit).
- `billingServer.js` — `authCompany(request)` (verifica JWT de sessão → company_id),
  `siteUrl(request)`, reexporta `serviceClient`/`json`.
- `turnstile.js` — `verifyTurnstile(token, ip)` server-side; só cai na test key
  quando `NODE_ENV !== 'production'`.
- `email.js` — `sendOtpEmail(email, code)` via Brevo; remetente de
  `BREVO_SENDER_EMAIL` (default `contato@zcheckapp.com`).

### Novas rotas de API (em `ibr-checklists-app/app/api/`)
- `signup/request-otp/route.js` — valida e-mail + Turnstile + rate-limit; gera OTP,
  grava hash em `signups`, envia por Brevo.
- `signup/verify-otp/route.js` — confere OTP; devolve `claim_token` (guarda hash).
- `signup/provision/route.js` — valida claim; chama `provision_company` (service_role);
  força `plan: 'trial'`; 1 empresa por e-mail.
- `billing/checkout/route.js` — gestão cria preapproval no MP; devolve `init_point`.
- `billing/webhook/route.js` — valida x-signature, reconsulta o recurso no MP,
  ativa a empresa; dedup só para `authorized_payment` (preapproval reusa o mesmo id).
- `billing/cancel/route.js` — cancela preapproval; acesso segue até o fim do período.

### Modificados (principais)
- `lib/serverAuth.js` — + `verifySessionToken(token, {secret})` (HS256, checa exp;
  usado pelas rotas de billing para achar o company_id do chamador).
- `lib/supabase.js` — + `setCacheScope(companyId)` (namespaceia o cache local).
- `lib/sync.js` — cache namespaceado por empresa (`scoped()`), fila offline
  segue GLOBAL de propósito (`getRaw/setRaw`); `fetchTemplates([])`/`fetchUsers([])`
  para não-IBR (fim da contaminação); `saveCompany` virou **UPDATE** (não upsert
  parcial — quebrava por NOT NULL); + `uploadCompanyLogo`, `deleteUnit`, `deleteSector`.
- `app/page.js` (landing) — reescrita de posicionamento (5 pilares) + CTA para
  `/comecar` + oferta (trial/tiers). (feito em turnos anteriores desta linha).
- `app/comecar/page.js` — cadastro **ENXUTO**: 4 passos (e-mail/OTP → nome da
  empresa → gestor). Sucesso tem botão "Copiar link". `overflow-x:hidden`/`width:100%`.
- `app/entrar/page.js` — resolve empresa pelo **banco** (`companies.slug`), não
  por mapa fixo; `SUBDOMAIN_ALIAS` (ibr→ilhabelarepublic) e `CODE_ALIAS`
  (ilhabelarepublic→ibr) preservam o IBR. Header claro + logo.
- `app/cadastro/page.js` — removeu lojas IBR hardcoded; solicitante não escolhe
  loja (gestor vincula depois); solicitação nasce com o `company_id` do tenant
  (resolvido pela slug), senão não chegava ao gestor.
- `app/app/page.js` (**monólito ~8300 linhas — o grosso**): multi-tenant real
  (ver §3), onboarding guiado, paywall/nudge/contador de trial, editor de checklist
  com foto+dias, Gerenciar com editar/remover loja + logo, Importar CSV in-app.
- `app/globals.css` — `input,select,textarea{font-size:16px}` no mobile (evita
  zoom do iOS ao focar); `input,select,textarea,button{min-width:0}` (fim do
  overflow em flex); `html,body{overflow-x:clip;max-width:100%}` (cinturão que
  não quebra o header sticky, diferente de `overflow:hidden`).

---

## 3. Decisões técnicas (com justificativa)

- **Auth de servidor por JWT do Supabase:** o token de sessão é HS256 assinado com
  o **próprio `SUPABASE_JWT_SECRET`** — uma peça só resolve auth das rotas E
  alimenta o RLS via `auth.jwt()`. `users.id` NÃO é UUID (strings tipo `u1`,
  `kalit-...`), então RLS lê `auth.jwt() ->> 'user_id'`/`company_id`, **nunca**
  `auth.uid()`. Token vive **só em memória** (reload exige novo PIN).
- **Multi-tenant na UI via Context, não props:** `app/app/page.js` tinha a
  constante `UNITS` (IBR1/2/3) lida em ~30 lugares. Em vez de threadar props por
  8 componentes (fácil esquecer um), criei `UnitsContext`/`useUnits()` e
  `SectorsContext`/`useSectors()`; o provider injeta `ACTIVE_UNITS`/`dynamicSectors`.
  Restam `UNITS` cruas só no seed do IBR (`generateSeedTemplates`) e no default do
  `ACTIVE_UNITS` — corretos. O gate `if ((currentUser.companyId) === 'ibr')`
  isola o comportamento antigo/seed do IBR.
- **`company.id = slug + '-' + uid`** (self-service). Consequência: **subdomínio
  (slug) ≠ company_id**. O app resolve a empresa pela slug primeiro e usa o
  `company.id` REAL para units/setores/tipos/`public_users` (senão vinha vazio).
  O IBR funciona porque `company_id === 'ibr'` coincide com a slug detectada.
- **`company_is_active()` bloqueia ESCRITA no RLS** (`with check`), preservando a
  leitura (`using`), para o paywall não ser só cosmético (JWT dura 8h). Backfill do
  IBR como `active` ANTES do enforcement, senão travaria o piloto.
- **Mercado Pago = preapproval SEM plano associado** → redireciona pro checkout
  hospedado (`init_point`), zero manuseio de cartão/PCI nosso. Webhook valida
  x-signature (`id:{data.id};request-id:{req-id};ts:{ts};` HMAC-SHA256) **e**
  reconsulta o recurso na API do MP (corpo do webhook não é fonte de verdade).
- **Anti-abuso do signup:** e-mail OTP (Brevo, hash no banco) + Turnstile
  server-side + rate-limit por e-mail/IP. Estado em `signups`, só service_role toca.
- **`saveCompany` é UPDATE** (não upsert): a empresa sempre já existe no onboarding;
  upsert parcial tentava INSERT e o Postgres checa NOT NULL (name/slug) antes do
  ON CONFLICT → quebrava o "Concluir".
- **DNS migrado para os nameservers do Vercel** (`ns1/ns2.vercel-dns.com`) porque
  o wildcard `*.zcheckapp.com` (necessário p/ HTTPS de todo subdomínio novo) só é
  emitido pelo Vercel com DNS no Vercel. Os registros de **e-mail** (MX ImprovMX,
  SPF, brevo-code, DMARC, DKIM brevo1/brevo2) foram **recriados no Vercel DNS**
  antes de trocar o nameserver — NÃO mexer neles ou o OTP para de chegar.
- **Cache local namespaceado por empresa** (evita vazar nomes/dados de um tenant
  para outro no mesmo navegador via fallback offline). Fila offline fica GLOBAL de
  propósito (escopar orfanaria escritas pendentes de quem está offline no deploy).
- **Importar CSV virou modal in-app** (não página separada): página separada = full
  navigation que perde o token em memória → "Voltar deslogava".

---

## 4. Trabalho em andamento

**Nada pela metade.** O último item (Importar CSV in-app, `#6b`, commit `42c6f68`)
foi concluído, buildado, deployado e os apps respondem 200. A sessão terminou num
ponto estável, aguardando o usuário retestar a `kalit`.

---

## 5. Próximos passos (ordenados)

1. **Retestar na `kalit`** (empresa de teste; gestora **Lili**; subdomínio
   `kalit.zcheckapp.com/app`). O reteste de 18/07 gerou 6 correções, TODAS
   entregues no commit `589ba8a` (deployado): (a) CSV com os mesmos campos do
   editor — colunas novas `foto`, `dias`, `orientacao`, `video`, `link`, parser
   respeita aspas; (b) botão "Criar checklist" lista o que falta em vez de ficar
   cinza mudo; (c) biblioteca 12→26 modelos; (d) toast verde fixo em TODA criação
   (tipo/loja/setor/checklist/logo/importação) — componente `ToastHost` +
   `showToast()`; (e) botão Subir/Trocar logo ao lado do Importar CSV no
   Gerenciar; (f) `Ticket` com barra lateral sólida de 4px (antes 10px
   perfurada). **Aguardando novo reteste da Lili.**
2. **Go-live real do Mercado Pago:** hoje o `MP_ACCESS_TOKEN` é de **TESTE**.
   Trocar por credenciais de **produção** no Vercel + criar o **webhook de
   produção** no painel MP (mesma URL `https://zcheckapp.com/api/billing/webhook`,
   tópicos `subscription_preapproval` + `subscription_authorized_payment`) e
   atualizar `MP_WEBHOOK_SECRET`. Só então clientes conseguem pagar de verdade.
3. **Pix para plano ANUAL à vista** — pedido registrado na memória
   `pix-plano-anual.md`. Assinatura recorrente do MP só aceita cartão; Pix é
   avulso. Criar um fluxo separado de cobrança única por Pix (anual).
4. ~~**Otimizar latência do OTP**~~ — **FEITO em 18/07 (commit `086e2bd`)**: a rota
   `request-otp` agora roda Turnstile + rate-limits em paralelo e envia o e-mail
   pela Brevo DEPOIS de responder (`after()` do Next 15); se a Brevo recusar, a
   linha de `signups` é apagada em background (não conta no rate-limit, código
   fica inverificável). Deployado; falta o usuário confirmar que o e-mail chega.
5. Backlog antigo (do handoff anterior): assistente de IA por texto (precisa
   `ANTHROPIC_API_KEY` + tabela `ai_usage`); extração do monólito de ~8300 linhas
   + smoke test em CI (não há testes nem CI hoje); verificação server-side do
   Turnstile no `/cadastro` (hoje cosmético lá).

---

## 6. Problemas conhecidos / NÃO mexer

- **MP em modo TESTE:** o checkout abre o MP mas com cartões de teste; **um e-mail
  igual ao da conta vendedora do MP não consegue se auto-pagar** (o MP recusa).
  No teste, usar **Conta de teste (comprador)** do painel MP.
- **Sem staging:** UM único projeto Supabase (`rjuulamozdhssgqrzfji`); preview e
  produção **compartilham o mesmo banco**. Migrations aplicadas **à mão** no SQL
  Editor (não há migração automática). Mudança de migration = toca produção.
- **NÃO mexer nos registros de e-mail do Vercel DNS** (MX ImprovMX, SPF,
  brevo-code TXT, DMARC, CNAMEs `brevo1/brevo2._domainkey`) — o OTP depende deles.
- **NÃO regredir o IBR:** `companies.id='ibr'`, `subscription_status='active'`
  (cortesia), `onboarded_at` preenchido, e o app usa `id==='ibr'` como gate do
  comportamento single-tenant/seed. Qualquer refactor precisa ser testado contra
  o IBR **e** contra uma empresa nova.
- **NÃO rodar `next build` com um dev server de pé** na mesma pasta — corrompe o
  `.next` (erros ENOENT `.nft.json`/`pack`). Sempre `rm -rf .next` antes de buildar.
- `/importar` (página separada) ainda existe mas está **obsoleta** (perde sessão);
  o caminho oficial agora é o modal in-app no Gerenciar. Pode ser removida depois.
- `checklist_types` pode não ter coluna `shift`; `saveChecklistType` manda `shift`
  como `undefined` (JSON dropa a chave), então é inofensivo.
- **Empresas de teste no banco:** `kalit` (id `kalit-rscfw9ma`), `demo` (sem lojas,
  `onboarded_at` nulo → cai no onboarding, é esperado), `ibr` (piloto real).
  `teste-1`/`hotel-teste` foram apagadas durante os testes.
- **Limpar empresa de teste** (padrão usado): `delete` em completions, photos,
  closures, live_tasks, recognitions, action_plans, templates, users, sectors,
  checklist_types, units, events onde `company_id = '<id>'`, depois `companies` e
  `signups where provisioned_company_id = '<id>'`, dentro de `begin;…commit;`.

---

## 7. Contexto essencial

### Comandos
```bash
# raiz do git:
cd "/Users/michelfaria/Documents/Site ZCheck"

# build (ÚNICO portão automático; não há testes nem lint além de next lint):
cd ibr-checklists-app && rm -rf .next && npx next build   # esperar "Compiled successfully"

# deploy de produção (aliased em zcheckapp.com):
cd ibr-checklists-app && npx vercel --prod --yes

# git: trabalhar na main foi a norma nesta sessão (feature já mergeada);
# commits terminam com: Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```
`gh` NÃO está instalado neste ambiente; `pbcopy`/`pbpaste` (Mac) foram usados para
jogar SQL no clipboard do usuário (ele cola no SQL Editor do Supabase).

### Variáveis de ambiente no Vercel (Production + Preview) — sem expor valores
- Já existiam: `SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `PROVISION_SECRET`,
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Adicionadas nesta sessão: `BREVO_API_KEY`, `TURNSTILE_SECRET_KEY`,
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (atualizada p/ o widget novo),
  `MP_ACCESS_TOKEN` (TESTE hoje), `MP_WEBHOOK_SECRET`,
  `NEXT_PUBLIC_SITE_URL=https://zcheckapp.com`. Opcional: `BREVO_SENDER_EMAIL`
  (default `contato@zcheckapp.com`, já verificado no Brevo com DKIM+DMARC).
- Sem os secrets, as rotas respondem `server_misconfigured` (500) — padrão do projeto.

### Verificação sem login (o app exige PIN real)
Sondagens externas com a **anon key** (curl ao PostgREST) confirmam RLS:
`42501`/permission denied = protegido; `[]` = filtra mas grant sobra; JSON com
dados = vazando. As tabelas `signups` e `billing_events` devem negar anon;
`companies` é legível por anon (metadados de tenant, pré-login). O `company_is_active('ibr')`
deve retornar `true`.

### Peculiaridades
- `lib/tokens.js` é a fonte única de cor/raio/peso/tamanho (C/R/W/T). `globals.css`
  deve manter `@tailwind` no topo.
- Middleware redireciona subdomínios para `/app`. `getTenantSlug()` (`lib/tenant.js`)
  usa o subdomínio como slug; wildcard `*.zcheckapp.com` já resolve.
- Bug conhecido do preview local: renderer do Browser pane às vezes fica preto/trava;
  usar `read_page`/DOM em vez de screenshot; navegar de novo para recarregar.
- Memórias relevantes do projeto (em `~/.claude/.../memory/`): `self-service-signup.md`,
  `pix-plano-anual.md`, `auth-servidor-jwt.md`, `email-contato-setup.md`,
  `chrome-extension-blocks-godaddy-dns.md`.

### Commits-chave desta sessão (mais recentes primeiro)
`42c6f68` importar CSV in-app · `8d0ea42` editar/remover loja + logo no Gerenciar ·
`90aaad0` foto+dias no editor · `a26ce21` ZCheck fixo no header · `ceeb22c` logo
único + importar no Gerenciar · `5ca4543` overflow mobile · `e10602d` saveCompany
UPDATE + zoom iOS + skip-logo · `0879f17` 6 ajustes do teste · `beacc79` onboarding
guiado + cadastro enxuto · `20260716/17` migrations de billing/onboarding.
