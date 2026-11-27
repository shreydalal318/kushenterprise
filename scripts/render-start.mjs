// Container start (Dockerfile / render.yaml): apply migrations, load the first data on an empty
// database, then start the web app. Render's free plan has no pre-deploy step, so this runs here.
import { execSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const run = (cmd, env = {}) => execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } });

// Links in emails, sitemap.xml and shared documents use the public address Render assigns.
process.env.SITE_URL ||= process.env.RENDER_EXTERNAL_URL ?? '';

run('pnpm --filter @kush/db migrate:deploy');

const { PrismaClient } = createRequire(new URL('../packages/db/package.json', import.meta.url))('@prisma/client');
const db = new PrismaClient();
const users = await db.user.count();
// The demo's last step; until it exists (first boot, or an interrupted one) the demo seeds run again.
const demoLoaded = (await db.salesOrder.count({ where: { clientRequestId: { startsWith: 'demo-dlv-' } } })) > 0;
await db.$disconnect();

// SEED_DEMO=true loads the demo masters and activity (a hosted demo, never real data). The seeds run
// as development so the owner isn't forced to change the password and the demo guard lets them through.
const demo = process.env.SEED_DEMO === 'true';
const seedEnv = demo ? { NODE_ENV: 'development' } : {};
if (users === 0) run('pnpm --filter @kush/db seed', seedEnv);
if (demo && !demoLoaded) {
  run('pnpm --filter @kush/db seed:demo', seedEnv);
  run('pnpm --filter @kush/api seed:demo-activity', seedEnv);
}

const web = spawn('pnpm', ['--filter', '@kush/web', 'start'], { stdio: 'inherit', shell: process.platform === 'win32' });
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => web.kill(sig));
web.on('exit', (code) => process.exit(code ?? 0));
