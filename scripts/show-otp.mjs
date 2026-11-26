// Show the latest login codes sent by the development SMS provider (SMS_PROVIDER="console").
// Usage: pnpm otp            → last 5 messages
//        pnpm otp 9000010001 → latest code for that mobile
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const file = join(tmpdir(), 'kush-dev-sms.log');
const want = (process.argv[2] ?? '').replace(/\D/g, '').slice(-10);
if (!existsSync(file)) {
  console.log('No codes yet. On the login page choose "Mobile OTP", enter the mobile number and press "Send code", then run pnpm otp again.');
  process.exit(0);
}
const rows = readFileSync(file, 'utf8').trim().split('\n').map((l) => { const [at, to, msg] = l.split('\t'); return { at, to, msg }; })
  .filter((r) => r.msg && (!want || r.to.replace(/\D/g, '').endsWith(want)));
if (!rows.length) { console.log(want ? `No codes for ${want} yet. Press "Send code" on the login page first.` : 'No codes yet.'); process.exit(0); }
console.log('\nLatest login codes (valid for 5 minutes; only the newest one works):\n');
for (const r of rows.slice(-5).reverse()) {
  const code = r.msg.match(/\b(\d{6})\b/)?.[1] ?? '';
  const when = new Date(r.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  console.log(`  ${code.padEnd(8)} to ${r.to}   at ${when}`);
}
console.log('');
