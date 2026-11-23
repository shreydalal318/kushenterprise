import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import superjson from 'superjson';
import type { AppRouter } from '@kush/api';
import { API_URL } from './config';

export const trpc = createTRPCReact<AppRouter>();
export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type RouterInputs = inferRouterInputs<AppRouter>;

/** The current Bearer token (kept in memory; persisted in the keychain by auth.tsx). */
let bearer: string | null = null;
export const setBearer = (t: string | null) => { bearer = t; };

const link = () => httpBatchLink({
  url: `${API_URL}/api/trpc`,
  transformer: superjson,
  headers: () => (bearer ? { authorization: `Bearer ${bearer}` } : {}),
});
export const makeTrpcClient = () => trpc.createClient({ links: [link()] });
/** Plain client for code outside React (offline outbox). */
export const vanilla = createTRPCClient<AppRouter>({ links: [link()] });
