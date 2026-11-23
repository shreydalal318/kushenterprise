import { activityListInput } from '../schemas';
import { ownerProcedure, router } from '../trpc';

export const activityRouter = router({
  list: ownerProcedure.input(activityListInput).query(async ({ ctx, input }) => {
    const rows = await ctx.db.activityLog.findMany({
      where: {
        actorId: input.actorId,
        entityType: input.entityType,
        action: input.action ? { startsWith: input.action } : undefined,
        createdAt: { gte: input.from, lte: input.to },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      include: { actor: { select: { id: true, name: true, role: true } } },
    });
    const hasMore = rows.length > input.limit;
    const items = hasMore ? rows.slice(0, input.limit) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
  }),

  actors: ownerProcedure.query(({ ctx }) =>
    ctx.db.user.findMany({ where: { role: { in: ['OWNER', 'EMPLOYEE'] } }, select: { id: true, name: true }, orderBy: { name: 'asc' } })),
});
