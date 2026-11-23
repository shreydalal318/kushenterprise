import { Prisma, type CompanySettings, type Db } from '@kush/db';

export const DEFAULT_NOTIFICATIONS = {
  channels: { inApp: true, push: true, sms: false, whatsapp: false, email: true },
  orderStatusToCustomer: true,
  lowStockToOwner: true,
  expiryToOwner: true,
};
export const DEFAULT_GST_RATES = [0, 5, 12, 18];

/** Load the singleton settings row, creating it with placeholders on first use. */
export async function getSettings(db: Db): Promise<CompanySettings> {
  const s = await db.companySettings.findUnique({ where: { id: 'company' } });
  if (s) return s;
  return db.companySettings.upsert({
    where: { id: 'company' },
    create: {
      id: 'company',
      gstRates: DEFAULT_GST_RATES.map((r) => new Prisma.Decimal(r)),
      notificationConfig: DEFAULT_NOTIFICATIONS,
    },
    update: {},
  });
}

/** Plain JSON-friendly view of settings for clients. */
export function settingsView(s: CompanySettings) {
  return {
    ...s,
    gstRates: s.gstRates.map((d) => Number(d)),
    notificationConfig: { ...DEFAULT_NOTIFICATIONS, ...((s.notificationConfig as object | null) ?? {}) } as typeof DEFAULT_NOTIFICATIONS,
  };
}
