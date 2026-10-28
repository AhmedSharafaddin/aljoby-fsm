import Link from 'next/link';
import { Badge, Empty, Title } from '@/components/ui';
import { dayRange, db, fmtDateTime, localDate } from '@/lib/core';
import { ar } from '@/lib/labels';
import { orderScope } from '@/lib/permissions';
import { requirePage } from '@/lib/session';

export const metadata = { title: 'الجدولة والتوزيع' };

export default async function Scheduling({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const actor = await requirePage('order.assign');
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? '') ? sp.date! : localDate();
  const supervised = actor.role === 'SUPERVISOR' ? { supervisorId: actor.id } : {};

  const [waiting, newOnes, teams, drivers] = await Promise.all([
    db.serviceOrder.findMany({ where: { AND: [orderScope(actor), { status: 'APPROVED' }] }, include: { branch: true, customer: true }, orderBy: [{ priority: 'desc' }, { requestedDate: 'asc' }] }),
    actor.role === 'SUPERVISOR' ? Promise.resolve(0) : db.serviceOrder.count({ where: { status: 'NEW' } }),
    db.team.findMany({
      where: { isActive: true, ...supervised },
      include: {
        assignments: {
          where: { status: { in: ['ASSIGNED', 'IN_PROGRESS', 'ISSUE', 'COMPLETED'] }, scheduledStart: dayRange(date) },
          include: { order: { include: { customer: true } } },
          orderBy: { scheduledStart: 'asc' },
        },
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    }),
    db.user.findMany({
      where: { role: 'DRIVER', isActive: true, ...(actor.role === 'SUPERVISOR' ? { memberships: { some: { team: supervised } } } : {}) },
      include: {
        assignments: {
          where: { status: { in: ['ASSIGNED', 'IN_PROGRESS', 'ISSUE', 'COMPLETED'] }, scheduledStart: dayRange(date) },
          include: { order: { include: { customer: true } } },
          orderBy: { scheduledStart: 'asc' },
        },
      },
    }),
  ]);
  const lanes = [
    ...teams.map((t) => ({ id: t.id, title: `${t.name} · ${ar.service[t.type]} · سعة ${t.capacity}`, items: t.assignments })),
    ...drivers.filter((d) => d.assignments.length).map((d) => ({ id: d.id, title: `${d.name} · سائق`, items: d.assignments })),
  ];

  return (
    <>
      <Title action={<form className="flex gap-2"><input type="date" name="date" defaultValue={date} className="input w-auto" aria-label="اليوم" /><button className="btn-outline">عرض</button></form>}>
        الجدولة والتوزيع
      </Title>
      {newOnes > 0 && <p className="card mb-4 text-sm">يوجد {newOnes} طلب جديد بانتظار الاعتماد — <Link className="link" href="/orders?status=NEW">راجعها</Link>.</p>}

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-bold">طلبات معتمدة بانتظار الإسناد ({waiting.length})</h2>
        {waiting.length === 0 ? <Empty>لا توجد طلبات بانتظار الإسناد.</Empty> : (
          <div className="grid gap-3 md:grid-cols-2">
            {waiting.map((o) => (
              <Link key={o.id} href={`/orders/${o.id}`} className="card block hover:ring-brand">
                <div className="flex justify-between gap-2">
                  <b>#{o.number} · {ar.service[o.serviceType]}</b>
                  <Badge value={o.priority === 'URGENT' ? 'LATE' : 'NEW'} label={ar.priority[o.priority]} />
                </div>
                <div className="text-sm text-ink-muted">{o.customer.name} · {o.branch.name} · مطلوب {fmtDateTime(o.requestedDate).split('،')[0]}</div>
                <div className="text-sm">{o.address}</div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">جدول اليوم حسب الفريق</h2>
        {lanes.length === 0 ? <Empty>لا توجد فرق في نطاقك بعد.</Empty> : (
          <div className="space-y-3">
            {lanes.map((l) => (
              <div key={l.id} className="card">
                <div className="mb-2 font-semibold">{l.title}</div>
                {l.items.length === 0 ? <p className="text-sm text-ink-muted">متاح طوال اليوم.</p> : (
                  <ul className="space-y-1 text-sm">
                    {l.items.map((a) => (
                      <li key={a.id} className="flex flex-wrap items-center gap-2">
                        <span className="whitespace-nowrap text-ink-muted">{fmtDateTime(a.scheduledStart).split('،').pop()} ← {fmtDateTime(a.scheduledEnd).split('،').pop()}</span>
                        <Link className="link" href={`/orders/${a.orderId}`}>#{a.order.number}</Link>
                        <span>{a.order.customer.name}</span>
                        <Badge value={a.status} label={ar.assignment[a.status]} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
