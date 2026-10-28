// الجلسة في صفحات الخادم. نفس actorFromToken الذي تستخدمه الـ API.
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { type Actor, actorFromToken, SESSION_COOKIE } from './auth';
import { type Cap, can } from './permissions';

export async function currentActor(): Promise<Actor | null> {
  return actorFromToken((await cookies()).get(SESSION_COOKIE)?.value);
}

/** للصفحات: بلا جلسة ← الدخول، وبلا صلاحية ← صفحة الرفض. */
export async function requirePage(cap?: Cap): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) redirect('/login');
  if (cap && !can(actor, cap)) redirect('/denied');
  return actor;
}
