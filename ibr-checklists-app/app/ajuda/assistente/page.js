import { Chat } from './chat';

export const metadata = {
  title: 'Assistente',
  description: 'Converse com o assistente do ZCheck e tire suas dúvidas sobre o app.',
  robots: { index: false },
};

export default function AssistentePage() {
  return <Chat />;
}
