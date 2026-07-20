---
title: "Como importar checklists via CSV"
description: "Traga seus checklists de uma planilha usando o modelo CSV do ZCheck."
category: para-gestores
order: 5
updatedAt: "2026-07-20"
---

Já tem os checklists em planilha? Importe tudo de uma vez com um arquivo CSV, em vez de digitar item por item.

## Passo a passo

1. Abra **Gerenciar** e toque em **📥 Importar checklists via CSV**, no topo da tela.
2. Baixe o **modelo** para ver o formato esperado.
3. Monte sua planilha seguindo as colunas (abaixo) e exporte como CSV.
4. Cole o conteúdo ou carregue o arquivo no ZCheck.
5. Confira o **preview** — o app mostra o que será criado — e confirme a importação.

## O formato do arquivo

Colunas: tipo, checklist, loja, setor, tarefa, critico, foto, dias, orientacao, video, link, deadline

- Linha com tipo **checklist** cria o checklist (nome, loja, setor e, se quiser, o prazo em deadline).
- Linhas com tipo **tarefa** logo abaixo adicionam os itens daquele checklist.
- **critico** e **foto**: preencha com "sim" quando o item for crítico ou exigir foto.
- **dias**: dias da semana do item, separados por espaço (ex.: "seg qua sex"). Vazio = todos os dias.
- **orientacao**, **video**, **link**: o guia que aparece no botão Ver mais do item.

<!-- TODO: screenshot -->

> ⚠️ Os nomes de **loja** e **setor** no arquivo precisam existir na sua [Estrutura](/ajuda/para-gestores/lojas-setores-e-tipos) exatamente com a mesma grafia — confira antes de importar.

> 💡 Também existe a página dedicada **zcheckapp.com/importar** (mesmo formato, com login por PIN de gerência/diretoria) — útil para importar do computador.

