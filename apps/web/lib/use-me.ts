'use client';
import { can, isOwner, type Permission } from '@kush/core';
import { trpc } from './trpc';

/** Current user + permission helpers for showing/hiding controls (the API enforces the same rules). */
export function useMe() {
  const me = trpc.auth.me.useQuery(undefined, { staleTime: 60_000 });
  const u = me.data ? { role: me.data.role, permissions: me.data.permissions } : null;
  return {
    me: me.data,
    loading: me.isLoading,
    can: (p: Permission) => !!u && can(u as never, p),
    isOwner: !!u && isOwner(u as never),
  };
}
