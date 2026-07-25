import { Inter } from 'next/font/google';
import './globals.css';
import ServiceWorkerRegistrar from '../components/ServiceWorkerRegistrar';

/**
 * A fonte NUNCA era carregada. O stack em globals.css era
 * `-apple-system, BlinkMacSystemFont, 'Inter', system-ui` — com Inter em
 * terceiro e sem nenhum @font-face/next/font no projeto, ela jamais chegava:
 * no Mac renderizava SF Pro, no Windows Segoe UI. Como o comprador do plano
 * usa Windows, o produto se apresentava com a fonte de painel administrativo
 * genérico justamente para quem decide a compra.
 *
 * `tnum` (numerais tabulares) é o que faz coluna de número alinhar dígito a
 * dígito em tabela e ranking — sem isso, o "1" estreito desalinha a coluna.
 */
/* Sem `weight`: a Inter do Google é VARIÁVEL, e omitir o campo entrega um único
 * arquivo com toda a faixa 100–900 em vez de sete estáticos. Isso também cobre
 * o peso 800 que ainda existe em /importar, /admin e /entrar — com a lista fixa
 * de pesos, essas telas passariam a renderizar 800 por aproximação do
 * navegador, sem ninguém ter decidido isso. */
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata = {
  title: 'ZCheck',
  description: 'Checklists operacionais para empresas. Faça bem feito. Todo dia.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'ZCheck',
  },
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    apple: '/apple-touch-icon.png',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  // Sem trava de zoom: bloquear é falha WCAG 1.4.4, e o app é usado no celular,
  // sob sol, por quem precisa aproximar.
  themeColor: '#063C5C',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <head>
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="ZCheck" />
      </head>
      <body>
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  );
}
