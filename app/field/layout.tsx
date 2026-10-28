import Link from 'next/link';
import { LogoutButton } from '@/components/client';
import { ar } from '@/lib/labels';
import { requirePage } from '@/lib/session';

// واجهة الهاتف للفرق الميدانية: شريط علوي بسيط، أزرار كبيرة.
export default async function FieldLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePage('field.work');
  return (
    <>
      <header className="sticky top-0 z-10 flex items-center justify-between bg-brand px-4 py-3 text-ivory">
        <Link href="/field" className="-my-3 py-3 font-bold">مهامي</Link>
        <span className="text-xs">{actor.name} · {ar.role[actor.role]}</span>
        <LogoutButton />
      </header>
      <main className="mx-auto max-w-lg p-4">{children}</main>
    </>
  );
}
