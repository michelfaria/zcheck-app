import { buildSearchIndex } from '../../../lib/ajuda';

// Índice da busca client-side: gerado no build (estático), servido como JSON.
// Título + descrição + corpo em texto puro de todos os artigos.
export const dynamic = 'force-static';

export async function GET() {
  return Response.json(buildSearchIndex());
}
