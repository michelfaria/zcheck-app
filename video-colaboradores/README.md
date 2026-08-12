# Vídeo ZCheck — 1 minuto para colaboradores

Vídeo vertical **1080×1920, 60s, 30fps, sem áudio** explicando o ZCheck para quem
executa a rotina na loja. Formato pronto para WhatsApp Status, Reels e Stories.

## Arquivos

| Arquivo | O que é |
|---|---|
| `zcheck-colaboradores-1min.mp4` | **A entrega.** H.264, 1080×1920, 30fps, 4,0 Mbps — 29 MB |
| `zcheck-colaboradores-1min-whatsapp.mp4` | Mesmo vídeo a 1,7 Mbps — 13 MB, abaixo do limite de 16 MB do WhatsApp |
| `video.template.html` | Fonte da animação (o que se edita) |
| `video.html` | Gerado por `build.js` — igual ao template, com o logo em base64 |
| `build.js` | Embute `ibr-checklists-app/public/zcheck-logo.png` no HTML |
| `render.js` | Playwright → 1800 JPEGs determinísticos |
| `encode.swift` / `encode` | JPEGs → MP4 via AVFoundation |
| `preview.js` | Renderiza só os instantes pedidos, para conferir sem gerar o vídeo todo |

## Roteiro (60s)

| Tempo | Cena | Mensagem |
|---|---|---|
| 0,0–3,8 | Abertura | "Seu esforço agora aparece." |
| 3,8–12,6 | **Por onde começar** | Tour das 3 abas do colaborador, com a barra de baixo acendendo tab a tab |
| 12,6–18,4 | 1 · Entrar | PIN de 4 dígitos — sem e-mail, sem senha |
| 18,4–28,2 | 2 · Executar | Checklist do turno, item **crítico** pede foto, anel vai a 100% |
| 28,2–35,0 | 3 · Pontos | +1 tarefa · +2 crítica · +3 checklist completo |
| 35,0–43,4 | 4 · Meu ID | Índice 92, nível, dias seguidos, tarefas |
| 43,4–49,6 | 5 · Conquistas | As 8 conquistas reais, 6 desbloqueadas |
| 49,6–56,6 | 6 · Ranking | Ranking da equipe, últimos 7 dias |
| 56,6–60,0 | Fecho | "Cada tarefa conta." + zcheckapp.com |

O tour entrou sem esticar o vídeo: os 8,6s saíram das **pausas** no fim de cada
cena, não das animações. Continua 60,0s cravados.

O tour mostra as abas que o colaborador realmente tem — `ROLE_TABS.colaborador`
é `['executar','painel','id']`, e os rótulos são os `short` da BottomNav
(Rotina, Painel, Meu ID). Repare que o **ranking da equipe mora dentro do
Painel**, não numa aba própria: a aba `equipe` é só de liderança para cima.
O "abriu, já está na sua rotina" também é literal — o app abre em
`ROLE_TABS[role][0]`, que para o colaborador é `executar`.

⚠️ O `GestorTour` que existe no app é **outra coisa**: é o tour de primeiro uso
do gestor, e o colaborador não o vê. O tour deste vídeo é material de
comunicação, não uma tela do app.

Os números e regras vêm do app, não são inventados:

- pontuação de `computeProductivity` (`app/app/page.js`) — comum = 1, crítica = 2,
  checklist 100% = +3 rateado entre os executores;
- as 8 conquistas e o índice ponderado (conclusão 50% · críticos 30% · constância 20%)
  de `computeOperationalProfile`;
- nível = 1 checklist a cada 15 (`perLevel`), sequência de dias no fuso da loja;
- ranking da equipe dos últimos 7 dias, como no Painel.

Nomes e percentuais das pessoas são fictícios (Ana, Bruno, Carla, Diego).

## Regerar

```bash
cd video-colaboradores && node build.js && node render.js 30 && ./encode frames zcheck-colaboradores-1min.mp4 30 1080 1920 4500000
```

O último argumento é o bitrate em bps (use `1700000` para a versão de WhatsApp).
Se `encode` não existir: `swiftc -O encode.swift -o encode`.
Para conferir uma cena sem gerar o vídeo todo: `node preview.js 18 36 51` (segundos).

Para ver no navegador em tempo real, abra `video.html?play=1`.

## Notas técnicas

- Toda a animação é **função pura de `t`** (`window.__seek(t)`), então o render
  frame a frame é determinístico — nada de `requestAnimationFrame` na captura.
- Não há ffmpeg com libx264 nesta máquina (o que vem com o Playwright só faz VP8),
  por isso a codificação usa AVFoundation via `encode.swift`.
- Cores saem de `lib/tokens.js`: ink `#063C5C`, `successBright #16A34A`,
  `greenOnDark #4ADE80`, `inkMuted #9FB8C8` — os dois últimos são justamente os
  tokens medidos para texto sobre fundo ink.
- **Sem áudio.** Se for publicar com trilha, adicione na edição — o vídeo se
  entende sozinho, sem locução.
