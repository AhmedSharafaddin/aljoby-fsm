import Link from 'next/link';
import { Badge, Empty } from '@/components/ui';
import { dayRange, fmtDateTime, localDate } from '@/lib/core';
import { ar } from '@/lib/labels';
import { requirePage } from '@/lib/session';
import { listMyTasks } from '@/modules/tasks';

export const metadata = { title: 'مهامي' };

export default async function MyTasks() {
  const actor = await requirePage('field.work');
  const tasks = await listMyTasks(actor);
  const today = dayRange(localDate());
  const open = tasks.filter((t) => t.status !== 'COMPLETED');
  const groups = [
    { title: 'مهام اليوم', items: open.filter((t) => t.scheduledStart < today.lt) },
    { title: 'المهام القادمة', items: open.filter((t) => t.scheduledStart >= today.lt) },
    { title: 'أُنجزت مؤخرًا', items: tasks.filter((t) => t.status === 'COMPLETED') },
  ];
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.title}>
          <h2 className="mb-2 text-lg font-bold">{g.title} ({g.items.length})</h2>
          {g.items.length === 0 ? <Empty>لا شيء هنا.</Empty> : (
            <div className="space-y-2">
              {g.items.map((t) => (
                <Link key={t.id} href={`/field/tasks/${t.id}`} className="card block space-y-1 active:bg-muted">
                  <div className="flex items-center justify-between gap-2">
                    <b>{ar.service[t.order.serviceType]} · #{t.order.number}</b>
                    <Badge value={t.status} label={t.order.trip && t.status !== 'COMPLETED' ? ar.trip[t.order.trip.status] : ar.assignment[t.status]} />
                  </div>
                  <div className="text-sm">{fmtDateTime(t.scheduledStart)}</div>
                  <div className="text-sm text-ink-muted">{t.order.customer.name} · {t.order.address}</div>
                </Link>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
