import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'GuardianCharger Merida',
  description: 'Monitor de cargadores electricos en tiempo real',
  generator: 'v0.app',
  manifest: '/manifest.json',
  themeColor: '#0f172a',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'GuardianCharger',
  },
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/icons/icon-192.png',
  },
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className="bg-slate-900">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="font-sans antialiased bg-slate-900">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  // Desregistrar todos los SWs existentes para limpiar caches antiguas
                  navigator.serviceWorker.getRegistrations().then(function(registrations) {
                    var unregisterPromises = registrations.map(function(reg) {
                      return reg.unregister();
                    });
                    return Promise.all(unregisterPromises);
                  }).then(function() {
                    // Limpiar todos los caches del navegador
                    return caches.keys().then(function(keys) {
                      return Promise.all(keys.map(function(key) { return caches.delete(key); }));
                    });
                  }).then(function() {
                    // Registrar el SW actualizado
                    return navigator.serviceWorker.register('/sw.js');
                  });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  )
}
