/** Server-side configuration with safe development defaults. */
const isProd = process.env.NODE_ENV === 'production';

function authSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 32) return s;
  if (isProd) throw new Error('AUTH_SECRET must be set (32+ chars) in production');
  return 'dev-only-insecure-auth-secret-change-me-0000';
}

let cachedSecret: string | undefined;

export const env = {
  isProd,
  /** Read lazily so `next build` doesn't need runtime secrets; fails fast on first use in prod. */
  get authSecret(): string {
    return (cachedSecret ??= authSecret());
  },
  cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : isProd,
  smsProvider: process.env.SMS_PROVIDER ?? 'console',
  storageDriver: (process.env.STORAGE_DRIVER ?? 'local') as 'local' | 's3',
  storageLocalDir: process.env.STORAGE_LOCAL_DIR ?? './storage',
  s3: {
    endpoint: process.env.S3_ENDPOINT || undefined,
    region: process.env.S3_REGION ?? 'ap-south-1',
    bucket: process.env.S3_BUCKET ?? '',
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
  },
};

export const AUTH = {
  sessionCookie: 'ke_session',
  sessionDays: 30,
  /** Sessions are extended at most once a day to avoid a write per request. */
  sessionRefreshMs: 24 * 60 * 60 * 1000,
  maxFailedLogins: 5,
  lockMinutes: 15,
  otpTtlMinutes: 5,
  otpMaxAttempts: 5,
  otpResendSeconds: 30,
  otpMaxPerHour: 5,
};
