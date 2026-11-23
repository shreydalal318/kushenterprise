import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter, createContext } from '@kush/api/server';
import { isCrossSite } from '@/lib/same-origin';

export const dynamic = 'force-dynamic';

const handler = (req: Request) => {
  if (req.method === 'POST' && isCrossSite(req)) return new Response('Forbidden', { status: 403 });
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: ({ req: r, resHeaders }) => createContext({ headers: r.headers, resHeaders }),
    onError({ error, path }) {
      if (error.code === 'INTERNAL_SERVER_ERROR') console.error(`[trpc] ${path}:`, error);
    },
  });
};

export { handler as GET, handler as POST };
