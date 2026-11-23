import type { Metadata } from 'next';
import { MyProfile } from '@/components/portal/account';

export const metadata: Metadata = { title: 'Profile' };
export default function Page() { return <MyProfile />; }
