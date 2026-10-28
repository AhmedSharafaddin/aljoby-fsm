import Link from 'next/link';
import { ApiButton, ApiForm, PhotoUpload, ShareLocation, SignaturePad } from '@/components/client';
import { Badge } from '@/components/ui';
import { fmtDateTime } from '@/lib/core';
import { ar } from '@/lib/labels';
import { requirePage } from '@/lib/session';
import { completionMissing, nextTripStep } from '@/modules/rules';
import { getTask } from '@/modules/tasks';

export const metadata = { title: 'تفاصيل المهمة' };

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePage('field.work');
  const t = await getTask(actor, (await params).id).catch(() => null);
  if (!t) return <p className="card text-center">المهمة غير موجودة أو ليست مسندة إليك. <Link className="link" href="/field">مهامي</Link></p>;

  const o = t.order;
  const api = `/api/v1/field/tasks/${t.id}`;
  const working = t.status === 'IN_PROGRESS';
  const canStart = t.status === 'ASSIGNED' || t.status === 'ISSUE';
  const isTrip = !!o.trip;
  const next = o.trip ? nextTripStep(o.trip.status) : null;
  const missing = completionMissing(o.serviceType, t.files, o.carpet);
  const has = (k: string) => t.files.filter((f) => f.kind === k).length;
  const maps = o.mapUrl ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.address)}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">{ar.service[o.serviceType]} · #{o.number}</h1>
        <Badge value={t.status} label={ar.assignment[t.status]} />
      </div>

      <section className="card space-y-1 text-sm">
        <div><b>الموعد:</b> {fmtDateTime(t.scheduledStart)} ← {fmtDateTime(t.scheduledEnd)}</div>
        <div><b>العميل:</b> {o.customer.name} · <a className="link -my-3 inline-block py-3" dir="ltr" href={`tel:+${o.customer.phone}`}>+{o.customer.phone}</a></div>
        <div><b>العنوان:</b> {o.address} · <a className="link -my-3 inline-block py-3" href={maps} target="_blank" rel="noopener noreferrer">فتح الخريطة</a></div>
        <div><b>الفرع / الفاتورة:</b> {o.branch.name} · {o.invoiceNumber}</div>
        {o.itemsCount && <div><b>عدد القطع:</b> {o.itemsCount}</div>}
        {o.details && <div className="whitespace-pre-line"><b>التفاصيل:</b> {o.details}</div>}
        {o.trip && <div><b>التحميل من:</b> {o.trip.pickupAddress} ← <b>التسليم إلى:</b> {o.address}</div>}
        {o.carpet && <div><b>أمر الفرش:</b> {o.carpet.carpetType} · {String(o.carpet.areaSqm)} م²</div>}
      </section>

      {/* الأزرار الرئيسية حسب الحالة */}
      {!isTrip && canStart && <ApiButton action={`${api}/start`} label={t.status === 'ISSUE' ? 'استئناف المهمة' : 'بدء المهمة'} />}
      {isTrip && next && next !== 'DELIVERED' && (canStart || working) && (
        <ApiButton action={`${api}/trip`} body={{ to: next }} label={ar.tripAction[next]} />
      )}

      {isTrip && (
        <ol className="card flex justify-between text-center text-xs">
          {(['LOADED', 'DEPARTED', 'ARRIVED', 'DELIVERED'] as const).map((s) => {
            const done = ['ASSIGNED', 'LOADED', 'DEPARTED', 'ARRIVED', 'DELIVERED'].indexOf(o.trip!.status) >= ['ASSIGNED', 'LOADED', 'DEPARTED', 'ARRIVED', 'DELIVERED'].indexOf(s);
            return <li key={s} className={done ? 'font-bold text-brand' : 'text-ink-muted'}>{done ? '✓ ' : ''}{ar.tripAction[s]}</li>;
          })}
        </ol>
      )}

      {working && (
        <>
          <ShareLocation taskId={t.id} />
          {!isTrip && (
            <section className="card space-y-2">
              <h2 className="font-bold">الصور</h2>
              <PhotoUpload taskId={t.id} kind="BEFORE" label={`صورة قبل التنفيذ (${has('BEFORE')})`} />
              <PhotoUpload taskId={t.id} kind="AFTER" label={`صورة بعد التنفيذ (${has('AFTER')})`} />
            </section>
          )}
          {isTrip && <PhotoUpload taskId={t.id} kind="DELIVERY" label={`صورة إثبات التسليم — اختيارية (${has('DELIVERY')})`} />}

          {o.carpet && (
            <ApiForm action={`${api}/carpet`} submit="حفظ بيانات الفرش" className="card space-y-2">
              <h2 className="font-bold">بيانات أمر الفرش</h2>
              <Num name="workersCount" label="عدد العمال" value={o.carpet.workersCount} />
              <Num name="quantityReceived" label="الكمية المستلمة م²" value={o.carpet.quantityReceived?.toString()} step="0.01" required />
              <Num name="quantityUsed" label="الكمية المستخدمة م²" value={o.carpet.quantityUsed?.toString()} step="0.01" required />
              <label className="label" htmlFor="qualityNotes">ملاحظات الجودة</label>
              <textarea id="qualityNotes" name="qualityNotes" className="input" defaultValue={o.carpet.qualityNotes ?? ''} />
              {o.carpet.quantityReceived != null && o.carpet.quantityUsed != null && (
                <p className="text-sm">الهدر: <b>{Number(o.carpet.quantityReceived) - Number(o.carpet.quantityUsed)} م²</b></p>
              )}
            </ApiForm>
          )}

          <section className="card space-y-2">
            <h2 className="font-bold">توقيع العميل {has('SIGNATURE') > 0 && <span className="text-sm text-brand">✓ محفوظ</span>}</h2>
            <SignaturePad taskId={t.id} />
          </section>

          {missing.length > 0 && <p className="rounded-lg bg-warn/10 p-3 text-sm text-warn">قبل الإتمام ينقص: {missing.join('، ')}</p>}
          {isTrip
            ? next === 'DELIVERED' && <ApiButton action={`${api}/trip`} body={{ to: 'DELIVERED' }} label="تم التسليم — إنهاء الرحلة" />
            : <ApiButton action={`${api}/complete`} label="إنهاء المهمة" confirm="تأكيد إنهاء المهمة؟" />}
        </>
      )}

      {(working || t.status === 'ASSIGNED') && (
        <ApiButton action={`${api}/issues`} label="الإبلاغ عن مشكلة" variant="btn-danger" askReason="ما المشكلة؟" />
      )}
      {['ASSIGNED', 'IN_PROGRESS', 'ISSUE'].includes(t.status) && (
        <ApiForm action={`${api}/notes`} submit="إضافة ملاحظة" reset success="أُضيفت الملاحظة" className="card space-y-2">
          <label className="label" htmlFor="note">ملاحظة على المهمة</label>
          <textarea id="note" name="note" className="input" required minLength={2} />
        </ApiForm>
      )}

      <section className="card">
        <h2 className="mb-2 font-bold">السجل</h2>
        <ol className="space-y-1 text-sm">
          {t.events.map((e) => (
            <li key={e.id}><span className="text-ink-muted">{fmtDateTime(e.at)}</span> · {ar.event[e.type] ?? e.type}{e.note && ` — ${e.note}`}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Num(p: { name: string; label: string; value?: string | number | null; step?: string; required?: boolean }) {
  return (
    <div>
      <label className="label" htmlFor={p.name}>{p.label}</label>
      <input id={p.name} name={p.name} type="number" inputMode="decimal" min={0} step={p.step ?? '1'} required={p.required} defaultValue={p.value ?? ''} className="input" />
    </div>
  );
}
