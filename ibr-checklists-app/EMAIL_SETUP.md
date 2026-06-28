# E-mail contato@zcheckapp.com

O site ja aponta para `contato@zcheckapp.com`, mas a caixa postal precisa ser criada no provedor de e-mail/DNS do dominio `zcheckapp.com`.

## Opcao recomendada: Google Workspace

1. Criar a conta `contato@zcheckapp.com` no Google Workspace.
2. Validar o dominio no painel do Google.
3. No DNS de `zcheckapp.com`, adicionar os registros MX informados pelo Google Workspace.
4. Adicionar SPF, DKIM e DMARC para melhorar entrega e evitar spam.

## Opcao economica: Zoho Mail

1. Criar a organizacao no Zoho Mail com o dominio `zcheckapp.com`.
2. Criar o usuario/alias `contato`.
3. Validar o dominio no DNS.
4. Adicionar os registros MX, SPF, DKIM e DMARC mostrados pelo Zoho.

## Registros essenciais

- `MX`: direciona o recebimento de e-mails para o provedor escolhido.
- `SPF`: autoriza o provedor a enviar e-mails pelo dominio.
- `DKIM`: assina mensagens enviadas pelo dominio.
- `DMARC`: define politica contra falsificacao de remetente.

Depois que a caixa existir, todos os links `mailto:` da landing page abrirao mensagens para `contato@zcheckapp.com`.
