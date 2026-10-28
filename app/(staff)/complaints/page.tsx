import Link from 'next/link';
import { ApiForm } from '@/components/client';
import { Badge, Empty, Title } from '@/components/ui';
import { db, fmtDateTime } from '@/lib/core';
import { ar } from '@/lib/labels';
import { can, MANAGERS } from '@/lib/permissions';
import { requirePage } from '@/lib/session';
import { listComplaints } from '@/modules/service';

export const metadata = { title: 'الشكاوى' };

export default async function Complaints({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const actor = await requirePage('complaint.create');
  const status = (await searchParams).status;
  const items = await listComplaints(actor, status && status in ar.complaint ? status : undefined);
  const manage = can(actor, 'complaint.manage');
  const staff = manage ? await db.user.findMany({ where: { isActive: true, role: { in: [...MANAGERS, 'SUPERVISOR'] } }, orderBy: { name: 'asc' } }) : [];
  const names = new Map(staff.map((u) => [u.id, u.name]));

  return (
    <>
      <Title>الشكاوى</Title>
      <p className="mb-3 text-sm text-ink-muted">تُسجَّل الشكوى من صفحة الطلب نفسه لتُربط تلقائيًا بالعميل والفاتورة والفرع والخدمة.</p>
      <nav className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link className={`btn-outline ${!status ? 'bg-brand/10' : ''}`} href="/complaints">الكل</Link>
        {Object.entries(ar.complaint).map(([k, v]) => <Link key={k} className={`btn-outline ${status === k ? 'bg-brand/10' : ''}`} href={`?status=${k}`}>{v}</Link>)}
      </nav>
      {items.length === 0 ? <Empty>لا توجد شكاوى.</Empty> : (
        <div className="space-y-3">
          {items.map((c) => (
            <div key={c.id} className="card grid gap-3 md:grid-cols-[1fr_18rem]">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <b>CMP-{c.ticketNumber}</b>
                  <Badge value={c.status} label={ar.complaint[c.status]} />
                  <span className="text-xs text-ink-muted">فُتحت {fmtDateTime(c.openedAt)}{c.resolvedAt && ` · حُلّت ${fmtDateTime(c.resolvedAt)}`}</span>
                </div>
                <p>{c.description}</p>
                <p className="text-sm text-ink-muted">
                  {c.customer.name} · {c.branch.name} · فاتورة {c.order.invoiceNumber} · {ar.service[c.order.serviceType]} ·{' '}
                  <Link className="link" href={`/orders/${c.orderId}`}>طلب #{c.order.number}</Link>
                  {c.assignedToId && ` · المسؤول: ${names.get(c.assignedToId) ?? '—'}`}
                </p>
              </div>
              {manage && (
                <ApiForm action={`/api/v1/complaints/${c.id}`} method="PATCH" submit="تحديث" className="space-y-2">
                  <select name="status" defaultValue={c.status} className="input" aria-label="الحالة">
                    {Object.entries(ar.complaint).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <select name="assignedToId" defaultValue={c.assignedToId ?? ''} className="input" aria-label="المسؤول">
                    <option value="">المسؤول عن المعالجة</option>
                    {staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                  {actor.role === 'ADMIN' && <input name="reason" className="input" placeholder="سبب الرجوع لحالة سابقة (للمدير العام)" aria-label="سبب الرجوع" />}
                </ApiForm>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
