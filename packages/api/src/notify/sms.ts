import { appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from '../env';

export interface SmsProvider {
  name: string;
  send(toE164: string, message: string): Promise<void>;
}

/** Where the development SMS provider keeps the messages it would have sent (read by `pnpm otp`). */
export const DEV_SMS_LOG = join(tmpdir(), 'kush-dev-sms.log');

/** Development provider: prints messages to the server log and keeps the last few in memory (tests). */
export const outbox: { to: string; message: string; at: Date }[] = [];
const consoleProvider: SmsProvider = {
  name: 'console',
  async send(to, message) {
    outbox.push({ to, message, at: new Date() });
    if (outbox.length > 50) outbox.shift();
    if (process.env.NODE_ENV !== 'test') {
      console.info(`[sms:console] to=${to} :: ${message}`);
      // Also kept in a local file so `pnpm otp` can show the latest codes from any terminal.
      await appendFile(DEV_SMS_LOG, `${new Date().toISOString()}\t${to}\t${message}\n`).catch(() => {});
    }
  },
};

// Real providers (MSG91 / WhatsApp Cloud API) need DLT-registered templates; they plug in here in Phase 6.
export function smsProvider(): SmsProvider {
  switch (env.smsProvider) {
    case 'console':
      return consoleProvider;
    default:
      throw new Error(`SMS provider "${env.smsProvider}" is not configured yet`);
  }
}
