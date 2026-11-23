import { activityRouter } from './routers/activity';
import { authRouter } from './routers/auth';
import { employeesRouter } from './routers/employees';
import { settingsRouter } from './routers/settings';
import { createCallerFactory, router } from './trpc';

export const appRouter = router({
  auth: authRouter,
  settings: settingsRouter,
  employees: employeesRouter,
  activity: activityRouter,
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
