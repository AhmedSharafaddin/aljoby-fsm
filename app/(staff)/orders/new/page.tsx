import { ApiForm } from '@/components/client';
import { Title } from '@/components/ui';
import { db, localDate } from '@/lib/core';
import { ar } from '@/lib/labels';
import { requirePage } from '@/lib/session';

export const metadata = { title: 'طلب خدمة جديد' };

export default async function NewOrder() {
  const actor = await requirePage('order.create');
  const branches = actor.role === 'BRANCH' ? [] : await db.branch.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  return (
    <>
      <Title>طلب خدمة جديد</Title>
      <ApiForm action="/api/v1/orders" submit="إرسال الطلب للإدارة" redirect="/orders/:id" className="card max-w-2xl space-y-4">
        {branches.length > 0 && (
          <div>
            <label className="label" htmlFor="branchId">الفرع</label>
            <select id="branchId" name="branchId" className="input" required>
              <option value="">اختر الفرع</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}{b.city && ` — ${b.city}`}</option>)}
            </select>
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <Field name="invoiceNumber" label="رقم فاتورة البيع" required />
          <div>
            <label className="label" htmlFor="serviceType">نوع الخدمة</label>
            <select id="serviceType" name="serviceType" className="input" required>
              {Object.entries(ar.service).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <Field name="customerName" label="اسم العميل" required />
          <Field name="customerPhone" label="هاتف العميل" type="tel" required ltr />
          <Field name="requestedDate" label="التاريخ المطلوب" type="date" required defaultValue={localDate()} />
          <div>
            <label className="label" htmlFor="priority">الأولوية</label>
            <select id="priority" name="priority" className="input" defaultValue="NORMAL">
              {Object.entries(ar.priority).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        <Field name="address" label="العنوان (نصي — يكفي بدون خريطة)" required />
        <Field name="mapUrl" label="رابط الموقع على الخريطة (اختياري)" type="url" ltr />
        <fieldset className="grid gap-4 rounded-lg bg-muted/60 p-3 md:grid-cols-3">
          <legend className="px-1 text-sm font-semibold">حسب نوع الخدمة</legend>
          <Field name="itemsCount" label="أثاث: عدد القطع" type="number" />
          <Field name="carpetType" label="موكيت: النوع" />
          <Field name="areaSqm" label="موكيت: المساحة م²" type="number" step="0.01" />
          <div className="md:col-span-3"><Field name="pickupAddress" label="توصيل: نقطة التحميل (الافتراضي: عنوان الفرع)" /></div>
        </fieldset>
        <div>
          <label className="label" htmlFor="details">تفاصيل وملاحظات</label>
          <textarea id="details" name="details" className="input min-h-24" maxLength={2000} />
        </div>
      </ApiForm>
    </>
  );
}

function Field(p: { name: string; label: string; type?: string; required?: boolean; ltr?: boolean; defaultValue?: string; step?: string }) {
  return (
    <div>
      <label className="label" htmlFor={p.name}>{p.label}</label>
      <input id={p.name} name={p.name} type={p.type ?? 'text'} required={p.required} defaultValue={p.defaultValue} step={p.step} dir={p.ltr ? 'ltr' : undefined} className="input" />
    </div>
  );
}
