import Link from 'next/link';
import { Badge, Empty, Title } from '@/components/ui';
import { db, fmtDateTime } from '@/lib/core';
import { ar } from '@/lib/labels';
import { can } from '@/lib/permissions';
import { requirePage } from '@/lib/session';
import { listOrders } from '@/modules/orders';
import { isLate } from '@/modules/rules';

export const metadata = { title: 'الطلبات' };

export default async function Orders({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await requirePage();
  const sp = await searchParams;
  const { items, total, page, pages } = await listOrders(actor, sp);
  const branches = actor.role === 'BRANCH' ? [] : await db.branch.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  const pageHref = (p: number) => `?${new URLSearchParams({ ...sp, page: String(p) })}`;

  return (
    <>
      <Title action={can(actor, 'order.create') && <Link href="/orders/new" className="btn">طلب خدمة جديد</Link>}>
        {actor.role === 'BRANCH' ? 'طلبات الفرع' : 'الطلبات'}
      </Title>
      <form className="card mb-4 grid gap-2 md:grid-cols-5">
        <input name="q" defaultValue={sp.q} className="input md:col-span-2" placeholder="رقم الطلب، الفاتورة، اسم أو هاتف العميل" />
        <select name="status" defaultValue={sp.status ?? ''} className="input" aria-label="الحالة">
          <option value="">كل الحالات</option>
          {Object.entries(ar.order).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select name="serviceType" defaultValue={sp.serviceType ?? ''} className="input" aria-label="نوع الخدمة">
          <option value="">كل الخدمات</option>
          {Object.entries(ar.service).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {branches.length > 0 ? (
          <select name="branchId" defaultValue={sp.branchId ?? ''} className="input" aria-label="الفرع">
            <option value="">كل الفروع</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        ) : <span />}
        <button className="btn-outline md:col-start-5">بحث</button>
      </form>

      {items.length === 0 ? (
        <Empty>لا توجد طلبات مطابقة.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr><th>الطلب</th><th>العميل</th><th>الفاتورة</th><th>الخدمة</th><th>الفرع</th><th>الموعد</th><th>الحالة</th></tr>
            </thead>
            <tbody>
              {items.map((o) => (
                <tr key={o.id}>
                  <td><Link className="link" href={`/orders/${o.id}`}>#{o.number}</Link>{o.priority === 'URGENT' && <span className="ms-1 text-xs text-danger">عاجل</span>}</td>
                  <td>{o.customer.name}</td>
                  <td>{o.invoiceNumber}</td>
                  <td>{ar.service[o.serviceType]}</td>
                  <td>{o.branch.name}</td>
                  <td className="whitespace-nowrap">{fmtDateTime(o.scheduledStart)}</td>
                  <td className="whitespace-nowrap">
                    <Badge value={o.status} label={ar.order[o.status]} />{' '}
                    {isLate(o) && <Badge value="LATE" label="متأخر" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-3 flex items-center justify-between text-sm text-ink-muted">
        <span>{total} طلب</span>
        <span className="flex gap-3">
          {page > 1 && <Link className="link" href={pageHref(page - 1)}>السابق</Link>}
          <span>صفحة {page} من {pages}</span>
          {page < pages && <Link className="link" href={pageHref(page + 1)}>التالي</Link>}
        </span>
      </div>
    </>
  );
}
