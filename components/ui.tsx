// عناصر عرض بسيطة للخادم.
import Link from 'next/link';
import type { Actor } from '@/lib/auth';
import { ar } from '@/lib/labels';
import { can, isField } from '@/lib/permissions';
import { LogoutButton } from './client';

const TONE: Record<string, string> = {
  NEW: 'bg-muted text-ink', APPROVED: 'bg-sky-100 text-sky-900', SCHEDULED: 'bg-indigo-100 text-indigo-900',
  ASSIGNED: 'bg-indigo-100 text-indigo-900', IN_PROGRESS: 'bg-amber-100 text-amber-900', BUSY: 'bg-amber-100 text-amber-900',
  COMPLETED: 'bg-brand/15 text-brand-shade', DELIVERED: 'bg-brand/15 text-brand-shade', AVAILABLE: 'bg-brand/15 text-brand-shade',
  RESOLVED: 'bg-brand/15 text-brand-shade', CLOSED: 'bg-muted text-ink-muted', CANCELLED: 'bg-muted text-ink-muted', REASSIGNED: 'bg-muted text-ink-muted',
  ISSUE_REPORTED: 'bg-danger/10 text-danger', ISSUE: 'bg-danger/10 text-danger', LATE: 'bg-danger/10 text-danger', ON_HOLD: 'bg-warn/10 text-warn',
};

export function Badge({ value, label }: { value: string; label: string }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[value] ?? 'bg-muted'}`}>{label}</span>;
}

export function Title({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold">{children}</h1>
      {action}
    </div>
  );
}

export function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'danger' }) {
  return (
    <div className="card">
      <div className="text-sm text-ink-muted">{label}</div>
      <div className={`mt-1 text-3xl font-bold ${tone === 'danger' ? 'text-danger' : ''}`}>{value ?? '—'}</div>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="card text-center text-ink-muted">{children}</p>;
}

const NAV: { href: string; label: string; show: (a: Actor) => boolean }[] = [
  { href: '/dashboard', label: 'لوحة المؤشرات', show: (a) => can(a, 'dashboard.view') },
  { href: '/orders', label: 'الطلبات', show: (a) => !isField(a.role) },
  { href: '/orders/new', label: 'طلب جديد', show: (a) => can(a, 'order.create') },
  { href: '/scheduling', label: 'الجدولة والتوزيع', show: (a) => can(a, 'order.assign') },
  { href: '/teams', label: 'الفرق', show: (a) => can(a, 'order.assign') },
  { href: '/complaints', label: 'الشكاوى', show: (a) => can(a, 'complaint.create') },
  { href: '/reports', label: 'التقارير', show: (a) => can(a, 'report.view') },
  { href: '/settings', label: 'المستخدمون والفروع', show: (a) => can(a, 'user.manage') },
];

/** القائمة الجانبية للحاسوب، وشريط أفقي قابل للتمرير على الهاتف. */
export function Shell({ actor, children }: { actor: Actor; children: React.ReactNode }) {
  const items = NAV.filter((n) => n.show(actor));
  return (
    <div className="md:flex">
      <aside className="bg-brand text-ivory md:sticky md:top-0 md:h-dvh md:w-60 md:shrink-0">
        <div className="flex items-center justify-between p-4">
          <div>
            <div className="text-lg font-bold">خدمات الجوبي</div>
            <div className="text-xs text-ivory/80">{actor.name} · {ar.role[actor.role]}</div>
          </div>
          <span className="md:hidden"><LogoutButton /></span>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible">
          {items.map((n) => (
            <Link key={n.href} href={n.href} className="shrink-0 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-white/10">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="hidden p-4 md:block"><LogoutButton /></div>
      </aside>
      {/* min-w-0: بدونها يتمدد العمود لعرض الجدول بدل أن يمرّر الجدول داخل بطاقته */}
      <main className="mx-auto w-full min-w-0 max-w-6xl p-4 md:p-8">{children}</main>
    </div>
  );
}
