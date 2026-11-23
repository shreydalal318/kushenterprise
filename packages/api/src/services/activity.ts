import type { Db, Prisma } from '@kush/db';

export interface ActivityInput {
  actorId?: string | null;
  action: string; // e.g. "settings.update", "employee.permissions"
  entityType: string;
  entityId: string;
  summary?: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

const json = (v: unknown) => (v === undefined ? undefined : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue));

/** Append to the audit trail. Call inside the same transaction as the change it records. */
export function logActivity(db: Db, a: ActivityInput) {
  return db.activityLog.create({
    data: {
      actorId: a.actorId ?? null,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      summary: a.summary,
      before: json(a.before),
      after: json(a.after),
      ip: a.ip ?? null,
    },
  });
}

/** Only the fields that actually changed, for compact before/after logs. */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const k of Object.keys(after)) {
    const nv = after[k];
    const ov = before[k];
    if (JSON.stringify(nv) !== JSON.stringify(ov)) {
      b[k] = ov;
      a[k] = nv;
    }
  }
  return { before: b, after: a, changed: Object.keys(a) };
}
