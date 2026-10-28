import { ApiForm } from '@/components/client';
import { Stat, Title } from '@/components/ui';
import { ar } from '@/lib/labels';
import { requirePage } from '@/lib/session';
import { costsReport, employeesReport, money, ordersReport } from '@/modules/reports';

export const metadata = { title: 'التقارير' };
const COST = { FUEL: 'الوقود', MAINTENANCE: 'الصيانة', OVERTIME: 'الساعات الإضافية', OTHER: 'أخرى' };

export default async function Reports({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const actor = await requirePage('report.view');
  const sp = await searchParams;
  const range = { from: sp.from || undefined, to: sp.to || undefined };
  const [orders, staff, costs] = await Promise.all([ordersReport(actor, range), employeesReport(actor, range), costsReport(actor, range)]);
  const qs = `from=${orders.from}&to=${orders.to}&format=csv`;
  const roles = ['INSTALLER', 'CARPET_LAYER', 'DRIVER'] as const;

  return (
    <>
      <Title
        action={
          <form className="flex flex-wrap gap-2">
            <input type="date" name="from" defaultValue={orders.from} className="input w-auto" aria-label="من" />
            <input type="date" name="to" defaultValue={orders.to} className="input w-auto" aria-label="إلى" />
            <button className="btn-outline">عرض</button>
          </form>
        }
      >
        التقارير
      </Title>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="الطلبات" value={orders.totals.orders} />
        <Stat label="المنجز" value={orders.totals.completed} />
        <Stat label="المتأخر" value={orders.totals.late} tone={orders.totals.late ? 'danger' : undefined} />
        <Stat label="الملغى" value={orders.totals.cancelled} />
        <Stat label="الشكاوى" value={orders.totals.complaints} />
      </div>

      <Section title="أداء الفروع" csv={`/api/v1/reports/branches?${qs}`}>
        <table className="table">
          <thead><tr><th>الفرع</th><th>الطلبات</th><th>المنجز</th><th>المتأخر</th><th>الملغى</th></tr></thead>
          <tbody>
            {orders.byBranch.map((b) => <tr key={b.branch}><td>{b.branch}</td><td>{b.orders}</td><td>{b.completed}</td><td>{b.late}</td><td>{b.cancelled}</td></tr>)}
          </tbody>
        </table>
      </Section>

      {roles.map((role) => {
        const rows = staff.items.filter((u) => u.role === role);
        return (
          <Section key={role} title={`أداء ${role === 'INSTALLER' ? 'معلمي الأثاث' : role === 'CARPET_LAYER' ? 'المفروشين' : 'السائقين'}`} csv={`/api/v1/reports/employees?${qs}`}>
            <table className="table">
              <thead>
                <tr>
                  <th>الموظف</th><th>{role === 'DRIVER' ? 'الرحلات المسلمة' : 'المهام'}</th>
                  {role === 'INSTALLER' && <th>القطع المركبة</th>}
                  {role === 'CARPET_LAYER' && <><th>المساحة م²</th><th>الهدر م²</th></>}
                  {role === 'DRIVER' && <th>الوقود ({costs.currency})</th>}
                  <th>ساعات العمل</th><th>متوسط الزمن (دقيقة)</th><th>الالتزام بالموعد</th><th>تقييم العملاء</th><th>الشكاوى</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}{!u.isActive && ' (موقوف)'}</td>
                    <td>{u.tasks}</td>
                    {'pieces' in u && <td>{u.pieces}</td>}
                    {'areaSqm' in u && <><td>{u.areaSqm}</td><td>{u.wasteSqm}</td></>}
                    {role === 'DRIVER' && <td>{(u.fuel ?? 0).toLocaleString('ar')}</td>}
                    <td>{u.hours}</td>
                    <td>{u.avgMinutes ?? '—'}</td>
                    <td>{u.onTimeRate == null ? '—' : `${u.onTimeRate}%`}</td>
                    <td>{u.avgStars ?? '—'}</td>
                    <td>{u.complaints}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={9} className="text-ink-muted">لا يوجد {ar.role[role]} مسجل.</td></tr>}
              </tbody>
            </table>
          </Section>
        );
      })}

      <Section title={`التكاليف — الإجمالي ${money(costs.totalMinor)}`} csv={`/api/v1/reports/costs?${qs}`}>
        <div className="grid gap-4 p-4 md:grid-cols-2">
          <div className="space-y-3">
            <table className="table">
              <tbody>
                {(Object.entries(costs.byCategory) as [keyof typeof COST, number][]).map(([k, v]) => (
                  <tr key={k}><td>{COST[k]}</td><td>{money(v)}</td></tr>
                ))}
              </tbody>
            </table>
            {costs.byOrder.length > 0 && (
              <table className="table">
                <thead><tr><th>تكلفة الطلب/الرحلة</th><th>الخدمة</th><th>المبلغ</th></tr></thead>
                <tbody>
                  {costs.byOrder.map((o) => <tr key={o.order}><td>#{o.order}</td><td>{ar.service[o.type as keyof typeof ar.service]}</td><td>{money(o.totalMinor)}</td></tr>)}
                </tbody>
              </table>
            )}
          </div>
          <ApiForm action="/api/v1/costs" submit="تسجيل التكلفة" reset success="سُجّلت التكلفة" className="space-y-2">
            <h3 className="font-bold">تكلفة جديدة</h3>
            <select name="category" className="input" aria-label="الفئة">
              {Object.entries(COST).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input name="amount" className="input" inputMode="decimal" placeholder={`المبلغ (${costs.currency})`} required pattern="\d+(\.\d{1,2})?" aria-label="المبلغ" dir="ltr" />
            <input name="date" type="date" className="input" defaultValue={orders.to} required aria-label="التاريخ" />
            <input name="orderNumber" type="number" min={1} className="input" placeholder="رقم الطلب/الرحلة (اختياري)" aria-label="رقم الطلب" />
            <input name="note" className="input" placeholder="ملاحظة (اختياري)" aria-label="ملاحظة" />
          </ApiForm>
        </div>
      </Section>

      <Section title={`تفصيل الطلبات (${orders.items.length})`} csv={`/api/v1/reports/orders?${qs}`}>
        <p className="p-3 text-sm text-ink-muted">نزّل ملف CSV لكل الطلبات في الفترة مع الحالة والتأخير والشكاوى.</p>
      </Section>
    </>
  );
}

function Section({ title, csv, children }: { title: string; csv: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-bold">{title}</h2>
        <a className="link text-sm" href={csv}>تصدير CSV</a>
      </div>
      <div className="card overflow-x-auto p-0">{children}</div>
    </section>
  );
}
