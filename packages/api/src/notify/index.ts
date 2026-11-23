import type { Db, NotificationChannel, Tx } from '@kush/db';
import { prisma } from '@kush/db';
import { getSettings, settingsView } from '../services/settings';
import { smsProvider } from './sms';

export interface NotifyInput {
  userIds: string[];
  title: string;
  body: string;
  link?: string | null;
  /** External channels wanted for this message (in-app is always written). */
  channels?: NotificationChannel[];
  /** Absolute link for WhatsApp / SMS / email (e.g. a signed PDF link); the in-app row keeps `link`. */
  externalLink?: string | null;
}

/** Company-level switches (Settings → Notifications) gate every external channel. */
async function enabledChannels(db: Db): Promise<Set<NotificationChannel>> {
  const c = settingsView(await getSettings(db)).notificationConfig.channels;
  const on = new Set<NotificationChannel>(['IN_APP']);
  if (c.push) on.add('PUSH');
  if (c.sms) on.add('SMS');
  if (c.whatsapp) on.add('WHATSAPP');
  if (c.email) on.add('EMAIL');
  return on;
}

/**
 * Record a notification for each user: an in-app row (shown in the bell / inbox) plus one queued
 * row per external channel. External rows are delivered after the transaction by deliverQueued().
 */
export async function notify(tx: Tx, input: NotifyInput) {
  const userIds = [...new Set(input.userIds)].filter(Boolean);
  if (!userIds.length) return 0;
  const on = await enabledChannels(tx);
  const external = (input.channels ?? []).filter((c) => c !== 'IN_APP' && on.has(c));
  const rows = userIds.flatMap((userId) => [
    { userId, channel: 'IN_APP' as const, title: input.title, body: input.body, link: input.link ?? null, status: 'sent' },
    ...external.map((channel) => ({ userId, channel, title: input.title, body: input.body, link: input.externalLink ?? input.link ?? null, status: 'queued', readAt: new Date() })),
  ]);
  await tx.notification.createMany({ data: rows });
  if (external.length) deliverSoon();
  return userIds.length;
}

/** Logins of a customer account (all portal / app users of that customer). */
export async function customerUserIds(db: Db, customerId: string) {
  return (await db.user.findMany({ where: { customerId, role: 'CUSTOMER', isActive: true }, select: { id: true } })).map((u) => u.id);
}

/** The employee assigned to a customer, plus every active owner. */
export async function staffForCustomer(db: Db, customerId: string | null) {
  const owners = await db.user.findMany({ where: { role: 'OWNER', isActive: true }, select: { id: true } });
  const c = customerId ? await db.customer.findUnique({ where: { id: customerId }, select: { assignedEmployeeId: true } }) : null;
  return [...owners.map((o) => o.id), ...(c?.assignedEmployeeId ? [c.assignedEmployeeId] : [])];
}

/** Notify a customer's logins through the channels they chose. */
export async function notifyCustomer(tx: Tx, customerId: string, msg: Omit<NotifyInput, 'userIds' | 'channels'>) {
  const c = await tx.customer.findUnique({ where: { id: customerId }, select: { notifyChannels: true } });
  return notify(tx, { ...msg, userIds: await customerUserIds(tx, customerId), channels: c?.notifyChannels ?? ['IN_APP'] });
}

// ------------------------------------------------------------------ delivery

export interface PushMessage { to: string; title: string; body: string; data?: Record<string, string> }
type Sender = (n: { title: string; body: string; link: string | null; user: { mobile: string | null; email: string | null; devices: { pushToken: string }[] } }) => Promise<'sent' | 'skipped'>;

/** Messages handed to the console providers (development and tests). */
export const deliveryLog: { channel: NotificationChannel; to: string; title: string }[] = [];
const log = (channel: NotificationChannel, to: string, title: string) => {
  deliveryLog.push({ channel, to, title });
  if (deliveryLog.length > 100) deliveryLog.shift();
  if (process.env.NODE_ENV !== 'test') console.info(`[notify:${channel.toLowerCase()}] to=${to} :: ${title}`);
};

/** Expo push service (no API key needed); console otherwise. */
async function sendPush(messages: PushMessage[]) {
  if ((process.env.PUSH_PROVIDER ?? 'console') !== 'expo') { for (const m of messages) log('PUSH', m.to, m.title); return; }
  const res = await fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(messages) });
  if (!res.ok) throw new Error(`Expo push failed: ${res.status}`);
}

const SENDERS: Partial<Record<NotificationChannel, Sender>> = {
  PUSH: async (n) => {
    if (!n.user.devices.length) return 'skipped';
    await sendPush(n.user.devices.map((d) => ({ to: d.pushToken, title: n.title, body: n.body, data: n.link ? { link: n.link } : undefined })));
    return 'sent';
  },
  SMS: async (n) => {
    if (!n.user.mobile) return 'skipped';
    await smsProvider().send(n.user.mobile, withLink(`${n.title}: ${n.body}`, n.link));
    return 'sent';
  },
  WHATSAPP: async (n) => {
    if (!n.user.mobile) return 'skipped';
    await sendWhatsApp(n.user.mobile, n.title, withLink(n.body, n.link));
    return 'sent';
  },
  EMAIL: async (n) => {
    if (!n.user.email) return 'skipped';
    await sendEmail(n.user.email, n.title, withLink(n.body, n.link));
    return 'sent';
  },
};

/** Only absolute links (signed PDF links, website pages) make sense outside the app. */
const withLink = (body: string, link: string | null) => (link && /^https?:\/\//.test(link) ? `${body}\n${link}` : body);

/**
 * WhatsApp Cloud API (Meta). Business-initiated messages must use an approved template; the
 * template (WHATSAPP_TEMPLATE, default "kush_update") takes two body parameters: title and message.
 * Without WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID messages go to the log.
 */
export async function sendWhatsApp(mobileE164: string, title: string, body: string) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) { log('WHATSAPP', mobileE164, title); return; }
  const res = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(phoneId)}/messages`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: mobileE164.replace(/^\+/, ''), type: 'template',
      template: { name: process.env.WHATSAPP_TEMPLATE ?? 'kush_update', language: { code: process.env.WHATSAPP_LANG ?? 'en' }, components: [{ type: 'body', parameters: [{ type: 'text', text: title.slice(0, 200) }, { type: 'text', text: body.replace(/\s*\n\s*/g, ' ').slice(0, 900) }] }] },
    }),
  });
  if (!res.ok) throw new Error(`WhatsApp send failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
}

/** Email through any SMTP server (SMTP_URL, e.g. smtps://user:password@smtp.example.com:465). Logged when not set. */
export async function sendEmail(to: string, subject: string, text: string) {
  const url = process.env.SMTP_URL;
  if (!url) { log('EMAIL', to, subject); return; }
  const { createTransport } = await import('nodemailer');
  const from = process.env.EMAIL_FROM ?? 'Kush Enterprise <no-reply@localhost>';
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2933"><p style="font-size:16px;font-weight:bold;color:#1b3a5c">${escapeHtml(subject)}</p>${text.split('\n').map((l) => (/^https?:\/\//.test(l) ? `<p><a href="${escapeHtml(l)}">${escapeHtml(l)}</a></p>` : `<p>${escapeHtml(l)}</p>`)).join('')}</div>`;
  await createTransport(url).sendMail({ from, to, subject, text, html });
}
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Send queued external notifications. Safe to call repeatedly (each row is claimed once). */
export async function deliverQueued(db: Db = prisma, limit = 100, only?: { userId?: string }) {
  const rows = await db.notification.findMany({
    where: { status: 'queued', ...(only?.userId ? { userId: only.userId } : {}) }, take: limit, orderBy: { createdAt: 'asc' },
    include: { user: { select: { mobile: true, email: true, devices: { select: { pushToken: true } } } } },
  });
  let sent = 0;
  for (const r of rows) {
    const claimed = await db.notification.updateMany({ where: { id: r.id, status: 'queued' }, data: { status: 'sending' } });
    if (!claimed.count) continue;
    let status = 'failed';
    try { status = (await SENDERS[r.channel]?.({ title: r.title, body: r.body, link: r.link, user: r.user })) ?? 'skipped'; } catch { status = 'failed'; }
    await db.notification.update({ where: { id: r.id }, data: { status } });
    if (status === 'sent') sent++;
  }
  return { processed: rows.length, sent };
}

let pending: ReturnType<typeof setTimeout> | null = null;
/** Deliver shortly after the current transaction has committed. */
export function deliverSoon() {
  if (pending) return;
  pending = setTimeout(() => { pending = null; void deliverQueued().catch((e) => console.error('[notify] delivery failed', e)); }, 300);
  pending.unref?.();
}
