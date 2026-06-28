# IBR Checklists v2

App operacional de checklists para Ilhabela Republic (IBR1, IBR2, IBR3).
Suporta **modo offline** — funciona sem internet, sincroniza quando a conexão voltar.

---

## Primeira vez — Deploy inicial

```bash
cd ~/Downloads/ibr-checklists-app
npm install
npx vercel
```

Confirme as perguntas com Enter. O link final é algo como `ibr-checklists.vercel.app`.

---

## Atualizações futuras

1. Baixe e descompacte o novo `.zip` do chat (substituindo a pasta antiga)
2. **Dê duplo clique no `atualizar.sh`**

> Se o Mac perguntar como abrir, escolha **Terminal**.

---

## Modo offline

O app funciona **sem internet**:
- Dados são salvos localmente no dispositivo (IndexedDB)
- Um banner vermelho aparece quando estiver sem conexão
- Quando a internet voltar, os dados pendentes são marcados para sincronização
- Na **Fase 2** (Supabase), a sincronização será automática com o banco central

---

## Instalar como app no celular

- **iPhone**: Safari → Compartilhar → "Adicionar à Tela de Início"
- **Android**: Chrome → 3 pontos → "Instalar app"

---

## Usuários padrão

| Usuário             | PIN  | Nível       |
|---------------------|------|-------------|
| Michel              | 1234 | Gestão      |
| Gestão Operacional  | 2222 | Gerência    |
| Colaborador IBR1    | 1111 | Colaborador |
| Colaborador IBR2    | 1111 | Colaborador |
| Colaborador IBR3    | 1111 | Colaborador |

---

## Roadmap

- [x] Fase 1 — App funcional com modo offline
- [ ] Fase 2 — Supabase: banco central + fotos na nuvem + sync automático
- [ ] Fase 3 — Vercel: deploy final com domínio próprio
