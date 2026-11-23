import { activityRouter } from './routers/activity';
import { authRouter } from './routers/auth';
import { customersRouter } from './routers/customers';
import { employeesRouter } from './routers/employees';
import { inventoryRouter } from './routers/inventory';
import { scanRouter } from './routers/scan';
import { priceListsRouter, pricingRouter } from './routers/pricing';
import { brandsRouter, productsRouter } from './routers/products';
import { settingsRouter } from './routers/settings';
import { suppliersRouter } from './routers/suppliers';
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
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
