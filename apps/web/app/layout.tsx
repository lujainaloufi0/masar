import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import './globals.css';
import { Providers } from './providers';
import type { Lang } from '@/lib/i18n';

export const metadata: Metadata = {
  title: 'Masar',
  description: 'Masar (مسار): a bilingual task workspace for government departments.',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F2F4F1' },
    { media: '(prefers-color-scheme: dark)', color: '#0A1411' },
  ],
};

/** Applies the system theme before first paint when the user hasn't picked one. */
const themeScript = `(function(){try{var d=document.documentElement;if(!d.dataset.theme){d.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}}catch(e){}})()`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const lang: Lang = jar.get('masar_lang')?.value === 'ar' ? 'ar' : 'en';
  const theme = jar.get('masar_theme')?.value;
  return (
    <html lang={lang} dir={lang === 'ar' ? 'rtl' : 'ltr'} data-theme={theme === 'dark' || theme === 'light' ? theme : undefined} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers lang={lang} theme={theme === 'dark' || theme === 'light' ? theme : undefined}>{children}</Providers>
      </body>
    </html>
  );
}
