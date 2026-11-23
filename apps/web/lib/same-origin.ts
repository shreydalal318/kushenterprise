/**
 * Cross-site request guard for state-changing requests (cookies are SameSite=Lax; this blocks
 * the rest). Accepts the request's own host, the host a reverse proxy forwarded (hosting,
 * GitHub Codespaces), the Codespaces preview address, and any TRUSTED_ORIGINS from the env.
 */
function trustedHosts(req: Request): Set<string> {
  const hosts = new Set<string>();
  const add = (h: string | null | undefined) => { for (const x of (h ?? '').split(',')) if (x.trim()) hosts.add(x.trim().toLowerCase()); };
  add(req.headers.get('host'));
  add(req.headers.get('x-forwarded-host'));
  const cs = process.env.CODESPACE_NAME;
  const domain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  if (cs && domain) add(`${cs}-${process.env.PORT ?? '3000'}.${domain}`);
  for (const o of (process.env.TRUSTED_ORIGINS ?? '').split(',')) {
    try { if (o.trim()) add(new URL(o.trim()).host); } catch { /* ignore malformed entries */ }
  }
  return hosts;
}

export function isCrossSite(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false; // same-origin GETs, server-to-server, the native mobile app
  try {
    return !trustedHosts(req).has(new URL(origin).host.toLowerCase());
  } catch {
    return true;
  }
}
