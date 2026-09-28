'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { MotionConfig } from 'framer-motion';
import { PrefsProvider } from '@/lib/prefs';
import type { Lang } from '@/lib/i18n';
import { ApiError } from '@/lib/api';

export function Providers({ lang, theme, children }: { lang: Lang; theme?: 'light' | 'dark'; children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: true,
            retry: (n, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && n < 2,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <MotionConfig reducedMotion="user">
        <PrefsProvider initialLang={lang} initialTheme={theme}>{children}</PrefsProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
