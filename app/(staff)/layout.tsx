import { redirect } from 'next/navigation';
import { Shell } from '@/components/ui';
import { isField } from '@/lib/permissions';
import { requirePage } from '@/lib/session';

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePage();
  if (isField(actor.role)) redirect('/field');
  return <Shell actor={actor}>{children}</Shell>;
}
