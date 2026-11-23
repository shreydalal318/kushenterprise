import { Prisma, type CompanySettings, type Db } from '@kush/db';

export const DEFAULT_NOTIFICATIONS = {
  channels: { inApp: true, push: true, sms: false, whatsapp: false, email: true },
  orderStatusToCustomer: true,
  lowStockToOwner: true,
  expiryToOwner: true,
};
export const DEFAULT_LABEL_SIZES = [
  { name: 'Thermal 50×25 mm', widthMm: 50, heightMm: 25, perSheet: 1 },
  { name: 'Thermal 38×25 mm', widthMm: 38, heightMm: 25, perSheet: 1 },
  { name: 'A4 sheet 65-up (38.1×21.2 mm)', widthMm: 38.1, heightMm: 21.2, perSheet: 65 },
];
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
      labelSizes: DEFAULT_LABEL_SIZES,
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
    labelSizes: ((s.labelSizes as typeof DEFAULT_LABEL_SIZES | null) ?? DEFAULT_LABEL_SIZES),
  };
}
