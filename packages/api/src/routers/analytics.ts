import { can, istDateString } from '@kush/core';
import { z } from 'zod';
import { gstSummary, ownerDashboard, salesAnalytics, salesRegister, staffHome, stockSummary } from '../services/analytics';
import { anyPermissionProcedure, permissionProcedure, router, staffProcedure } from '../trpc';

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const rangeInput = z.object({ from: iso, to: iso }).refine((r) => r.from <= r.to, 'From must be before To').refine((r) => Date.parse(r.to) - Date.parse(r.from) <= 731 * 86_400_000, 'Choose at most two years');
const analytics = permissionProcedure('VIEW_ANALYTICS');

export const analyticsRouter = router({
  /** Owner / analytics users get the business dashboard; everyone else their work list. */
  home: staffProcedure.query(async ({ ctx }) => (can(ctx.user, 'VIEW_ANALYTICS')
    ? { kind: 'owner' as const, owner: await ownerDashboard(ctx.db, { showCost: can(ctx.user, 'VIEW_PRICES_MARGINS') }), staff: await staffHome(ctx.db, ctx.user.id) }
    : { kind: 'staff' as const, owner: null, staff: await staffHome(ctx.db, ctx.user.id) })),
  /** Margins (cost vs selling price) only for users who may see costs. */
  sales: analytics.input(rangeInput).query(({ ctx, input }) => salesAnalytics(ctx.db, input, { showMargin: can(ctx.user, 'VIEW_PRICES_MARGINS') })),
  salesRegister: analytics.input(rangeInput).query(({ ctx, input }) => salesRegister(ctx.db, input)),
  gst: analytics.input(rangeInput).query(({ ctx, input }) => gstSummary(ctx.db, input)),
  stockSummary: anyPermissionProcedure('VIEW_ANALYTICS', 'MANAGE_STOCK').input(rangeInput).query(({ ctx, input }) => stockSummary(ctx.db, input)),
  today: staffProcedure.query(() => istDateString()),
});
