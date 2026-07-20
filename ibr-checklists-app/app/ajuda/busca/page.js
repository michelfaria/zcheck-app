import { Suspense } from 'react';
import { BuscaResults } from './results';

export const metadata = {
  title: 'Busca',
  robots: { index: false },
};

export default function BuscaPage() {
  return (
    <Suspense>
      <BuscaResults />
    </Suspense>
  );
}
