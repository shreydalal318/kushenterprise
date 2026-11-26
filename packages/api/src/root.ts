import { activityRouter } from './routers/activity';
import { analyticsRouter } from './routers/analytics';
import { authRouter } from './routers/auth';
import { customersRouter } from './routers/customers';
import { deliveriesRouter } from './routers/deliveries';
import { employeesRouter } from './routers/employees';
import { integrationsRouter } from './routers/integrations';
import { inventoryRouter } from './routers/inventory';
import { notificationsRouter } from './routers/notifications';
import { portalRouter } from './routers/portal';
import { purchaseOrdersRouter } from './routers/purchasing';
import { scanRouter } from './routers/scan';
import { creditNotesRouter, invoicesRouter, ledgerRouter, ordersRouter, paymentsRouter, proformasRouter, salesLookupRouter } from './routers/sales';
import { priceListsRouter, pricingRouter } from './routers/pricing';
import { brandsRouter, productsRouter } from './routers/products';
import { settingsRouter } from './routers/settings';
import { suppliersRouter } from './routers/suppliers';
import { leadsRouter, websiteRouter } from './routers/website';
import { createCallerFactory, router } from './trpc';

export const appRouter = router({
  auth: authRouter,
  settings: settingsRouter,
  employees: employeesRouter,
  activity: activityRouter,
  brands: brandsRouter,
  products: productsRouter,
  suppliers: suppliersRouter,
  customers: customersRouter,
  pricing: pricingRouter,
  priceLists: priceListsRouter,
  inventory: inventoryRouter,
  scan: scanRouter,
  sales: salesLookupRouter,
  orders: ordersRouter,
  proformas: proformasRouter,
  invoices: invoicesRouter,
  creditNotes: creditNotesRouter,
  payments: paymentsRouter,
  ledger: ledgerRouter,
  purchaseOrders: purchaseOrdersRouter,
  portal: portalRouter,
  notifications: notificationsRouter,
  analytics: analyticsRouter,
  website: websiteRouter,
  leads: leadsRouter,
  integrations: integrationsRouter,
  deliveries: deliveriesRouter,
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
