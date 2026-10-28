import { redirect } from 'next/navigation';
import { isField } from '@/lib/permissions';
import { currentActor } from '@/lib/session';

// كل دور يبدأ من شاشته
export default async function Home() {
  const actor = await currentActor();
  if (!actor) redirect('/login');
  redirect(isField(actor.role) ? '/field' : actor.role === 'BRANCH' ? '/orders' : '/dashboard');
}
