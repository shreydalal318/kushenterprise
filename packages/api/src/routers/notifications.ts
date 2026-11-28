import { z } from 'zod';
import { deliverQueued, notify, pushStatus } from '../notify';
import { authedProcedure, router } from '../trpc';

/** In-app inbox for every signed-in user (staff and customers), plus push-token registration for the app. */
export const notificationsRouter = router({
  list: authedProcedure.input(z.object({ unreadOnly: z.boolean().default(false), limit: z.number().int().min(1).max(200).default(50) }).optional()).query(({ ctx, input }) =>
    ctx.db.notification.findMany({
      where: { userId: ctx.user.id, channel: 'IN_APP', ...(input?.unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' }, take: input?.limit ?? 50,
      select: { id: true, title: true, body: true, link: true, readAt: true, createdAt: true },
    })),
  unreadCount: authedProcedure.query(({ ctx }) => ctx.db.notification.count({ where: { userId: ctx.user.id, channel: 'IN_APP', readAt: null } })),
  markRead: authedProcedure.input(z.object({ ids: z.array(z.string()).max(200).optional() })).mutation(async ({ ctx, input }) => {
    const r = await ctx.db.notification.updateMany({ where: { userId: ctx.user.id, channel: 'IN_APP', readAt: null, ...(input.ids ? { id: { in: input.ids } } : {}) }, data: { readAt: new Date() } });
    return { updated: r.count };
  }),
  /** The mobile app registers its Expo push token after sign-in. */
  registerDevice: authedProcedure.input(z.object({ platform: z.enum(['ios', 'android', 'web']), pushToken: z.string().min(10).max(500) })).mutation(async ({ ctx, input }) => {
    await ctx.db.device.upsert({ where: { pushToken: input.pushToken }, create: { userId: ctx.user.id, platform: input.platform, pushToken: input.pushToken }, update: { userId: ctx.user.id, platform: input.platform, lastSeen: new Date() } });
    return { ok: true };
  }),
  /** Is push set up end to end for me? (server switch, Firebase key, this account's registered phones) */
  pushStatus: authedProcedure.query(async ({ ctx }) => ({ ...(await pushStatus(ctx.db)), phones: await ctx.db.device.count({ where: { userId: ctx.user.id } }) })),
  /** Ring my own phones now, to check notifications work. */
  sendTest: authedProcedure.mutation(async ({ ctx }) => {
    await notify(ctx.db, { userIds: [ctx.user.id], title: 'Test notification', body: 'If your phone rang, notifications work ✓', link: null, channels: ['PUSH'] });
    const r = await deliverQueued(ctx.db, 20, { userId: ctx.user.id });
    const last = await ctx.db.notification.findFirst({ where: { userId: ctx.user.id, channel: 'PUSH' }, orderBy: { createdAt: 'desc' }, select: { status: true } });
    return { sent: r.sent, status: last?.status ?? 'none', phones: await ctx.db.device.count({ where: { userId: ctx.user.id } }) };
  }),
  unregisterDevice: authedProcedure.input(z.object({ pushToken: z.string() })).mutation(async ({ ctx, input }) => {
    await ctx.db.device.deleteMany({ where: { pushToken: input.pushToken, userId: ctx.user.id } });
    return { ok: true };
  }),
});
