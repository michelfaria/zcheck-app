import { Chat } from './chat';

export const metadata = {
  title: 'Zeca — assistente do ZCheck',
  description: 'Converse com o Zeca, o assistente do ZCheck, e tire suas dúvidas sobre o app.',
  robots: { index: false },
};

export default function AssistentePage() {
  return <Chat />;
}
