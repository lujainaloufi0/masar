function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}. Copy .env.example to .env and fill it in.`);
  return v;
}

export const config = {
  get jwtSecret() {
    const s = required('JWT_SECRET');
    if (process.env.NODE_ENV === 'production' && s.length < 32) throw new Error('JWT_SECRET must be at least 32 characters in production.');
    return s;
  },
  port: Number(process.env.API_PORT || process.env.PORT || 4000),
  webOrigin: (process.env.WEB_ORIGIN || 'http://localhost:3000').split(',').map((s) => s.trim()),
  demoMode: process.env.DEMO_MODE === 'true',
  demoResetCron: process.env.DEMO_RESET_CRON || '0 3 * * *',
  isProd: process.env.NODE_ENV === 'production',
  cookieName: 'masar_session',
  sessionHours: 10,
};
