import type { Metadata } from 'next';
import { requireOwner } from '@/lib/session';
import { ActivityLog } from './activity-log';

export const metadata: Metadata = { title: 'Activity log' };

export default async function ActivityPage() {
  await requireOwner();
  return <ActivityLog />;
}
