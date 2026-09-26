'use client';

import { useEffect } from 'react';

/**
 * Trava a rolagem da página enquanto um overlay está aberto.
 *
 * O defeito que isto fecha (vídeo de 21/09/2026, conferência no IBR2): com a
 * folha "Conferir execução" aberta, arrastar o dedo sobre ela rolava o Painel
 * ATRÁS — as linhas "Pca Alimentos", "Sala"… passavam por baixo do véu e a
 * folha ficava parada. No iPhone, o toque numa área que não rola (ou que já
 * chegou ao fim) é repassado ao documento, e `overflow: hidden` no body não
 * segura isso no Safari.
 *
 * O que segura: tirar o body do fluxo (`position: fixed`) exatamente no ponto
 * em que ele estava (`top: -scrollY`) e devolver a rolagem ao fechar — quem
 * volta da conferência cai na mesma linha da fila de onde saiu.
 *
 * Contador de módulo, não estado por componente: dois overlays empilhados
 * (a conferência e a foto aberta por cima dela) não podem destravar a página
 * quando só o de cima fecha.
 */
let travas = 0;
let salvo = null;

export function useTravaRolagem(ativo = true) {
  useEffect(() => {
    if (!ativo || typeof document === 'undefined') return undefined;
    if (travas++ === 0) {
      const b = document.body.style;
      const y = window.scrollY;
      salvo = { y, position: b.position, top: b.top, left: b.left, right: b.right, width: b.width, overflow: b.overflow };
      Object.assign(b, { position: 'fixed', top: `-${y}px`, left: '0', right: '0', width: '100%', overflow: 'hidden' });
    }
    return () => {
      travas -= 1;
      if (travas > 0 || !salvo) return;
      const { y, ...estilo } = salvo;
      salvo = null;
      Object.assign(document.body.style, estilo);
      window.scrollTo({ top: y, left: 0, behavior: 'instant' });
    };
  }, [ativo]);
}
