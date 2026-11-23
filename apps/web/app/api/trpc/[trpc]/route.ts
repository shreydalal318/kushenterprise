import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter, createContext } from '@kush/api/server';

export const dynamic = 'force-dynamic';

/** Reject cross-site requests: cookies are SameSite=Lax, and this blocks the rest. */
function crossSite(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false; // same-origin GETs, server-to-server, native mobile app
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

const handler = (req: Request) => {
  if (req.method === 'POST' && crossSite(req)) return new Response('Forbidden', { status: 403 });
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
