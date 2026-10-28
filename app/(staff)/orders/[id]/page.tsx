import Link from 'next/link';
import { ApiButton, ApiForm, ReviewLinkButton } from '@/components/client';
import { Badge, Title } from '@/components/ui';
import { db, fmtDateTime, proposedStart, toLocalInput } from '@/lib/core';
import { ar } from '@/lib/labels';
import { can } from '@/lib/permissions';
import { requirePage } from '@/lib/session';
import { assignmentCandidates, getOrder } from '@/modules/orders';
import { isLate } from '@/modules/rules';

export const metadata = { title: 'تفاصيل الطلب' };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePage();
  const o = await getOrder(actor, (await params).id).catch(() => null);
  if (!o) {
    return <p className="card text-center">الطلب غير موجود أو لا تملك صلاحية عرضه. <Link className="link" href="/orders">العودة للطلبات</Link></p>;
  }
  const active = o.assignments.find((a) => ['ASSIGNED', 'IN_PROGRESS', 'ISSUE'].includes(a.status));
  const canAssign = can(actor, 'order.assign');
  // الموعد المقترح: موعد التكليف الحالي، أو أقرب ساعة من التاريخ المطلوب — والاقتراح يُحسب له
  const slotStart = active?.scheduledStart ?? proposedStart(o.requestedDate);
  const slotEnd = active?.scheduledEnd ?? new Date(slotStart.getTime() + 3 * 3600_000);
  const candidates = canAssign ? await assignmentCandidates(actor, o, slotStart, slotEnd) : null;
  const users = new Map((await db.user.findMany({ select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const managers = can(actor, 'complaint.manage');

  return (
    <>
      <Title action={<span className="flex flex-wrap gap-2"><Badge value={o.status} label={ar.order[o.status]} />{isLate(o) && <Badge value="LATE" label="متأخر" />}</span>}>
        طلب #{o.number} · {ar.service[o.serviceType]}
      </Title>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card space-y-2 lg:col-span-2">
          <Row k="العميل" v={<>{o.customer.name} · <a className="link" dir="ltr" href={`tel:+${o.customer.phone}`}>+{o.customer.phone}</a></>} />
          <Row k="الفرع / الفاتورة" v={`${o.branch.name} · فاتورة ${o.invoiceNumber}`} />
          <Row k="العنوان" v={<>{o.address}{o.mapUrl && <> · <a className="link" href={o.mapUrl} target="_blank" rel="noopener noreferrer">الخريطة</a></>}</>} />
          <Row k="الأولوية" v={ar.priority[o.priority]} />
          <Row k="التاريخ المطلوب" v={fmtDateTime(o.requestedDate).split('،')[0]} />
          <Row k="الموعد المعتمد" v={o.scheduledStart ? `${fmtDateTime(o.scheduledStart)} ← ${fmtDateTime(o.scheduledEnd)}` : 'لم يُجدول'} />
          {o.completedAt && <Row k="اكتمل" v={fmtDateTime(o.completedAt)} />}
          {o.itemsCount && <Row k="عدد القطع" v={o.itemsCount} />}
          {o.details && <Row k="التفاصيل" v={<span className="whitespace-pre-line">{o.details}</span>} />}
          {o.carpet && (
            <Row k="أمر الفرش" v={<>
              {o.carpet.carpetType} · {String(o.carpet.areaSqm)} م² · العمال: {o.carpet.workersCount ?? '—'} ·
              المستلم: {o.carpet.quantityReceived?.toString() ?? '—'} · المستخدم: {o.carpet.quantityUsed?.toString() ?? '—'} ·
              الهدر: {o.carpet.quantityReceived != null && o.carpet.quantityUsed != null ? Number(o.carpet.quantityReceived) - Number(o.carpet.quantityUsed) : '—'} م²
              {o.carpet.qualityNotes && <div className="text-ink-muted">ملاحظات الجودة: {o.carpet.qualityNotes}</div>}
            </>} />
          )}
          {o.trip && (
            <Row k="الرحلة" v={<>
              <Badge value={o.trip.status} label={ar.trip[o.trip.status]} /> · التحميل من: {o.trip.pickupAddress}
              <div className="text-xs text-ink-muted">
                تحميل {fmtDateTime(o.trip.loadedAt)} · خروج {fmtDateTime(o.trip.departedAt)} · وصول {fmtDateTime(o.trip.arrivedAt)} · تسليم {fmtDateTime(o.trip.deliveredAt)}
              </div>
            </>} />
          )}
          {o.review && <Row k="تقييم العميل" v={`★ ${o.review.stars}/5 · الموعد ${o.review.punctuality}/5 · الجودة ${o.review.serviceQuality}/5${o.review.notes ? ` · «${o.review.notes}»` : ''}`} />}
        </section>

        <section className="card space-y-3">
          <h2 className="font-bold">الإجراءات</h2>
          {o.status === 'NEW' && can(actor, 'order.approve') && <ApiButton action={`/api/v1/orders/${o.id}/approve`} label="اعتماد الطلب" />}
          {o.status === 'APPROVED' && canAssign && candidates && (
            <AssignForm action={`/api/v1/orders/${o.id}/assign`} c={candidates} start={slotStart} end={slotEnd} submit="جدولة وإسناد" />
          )}
          {active && canAssign && candidates && (active.status === 'ASSIGNED' || active.status === 'ISSUE') && (
            <details>
              <summary className="cursor-pointer font-semibold text-brand">إعادة الإسناد</summary>
              <AssignForm action={`/api/v1/assignments/${active.id}/reassign`} c={candidates} start={slotStart} end={slotEnd} submit="إعادة الإسناد" />
            </details>
          )}
          {can(actor, 'order.hold') && ['APPROVED', 'SCHEDULED', 'ISSUE_REPORTED'].includes(o.status) && (
            <ApiButton action={`/api/v1/orders/${o.id}/hold`} label="إيقاف مؤقت" variant="btn-outline" askReason="سبب الإيقاف؟" />
          )}
          {can(actor, 'order.hold') && o.status === 'ON_HOLD' && (
            <ApiButton action={`/api/v1/orders/${o.id}/resume`} label="استئناف (يعود للجدولة)" variant="btn-outline" askReason="ملاحظة الاستئناف؟" />
          )}
          {can(actor, 'order.hold') && !['IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(o.status) && (
            <ApiButton action={`/api/v1/orders/${o.id}/cancel`} label="إلغاء الطلب" variant="btn-danger" askReason="سبب الإلغاء؟" />
          )}
          {o.status === 'COMPLETED' && !o.review && can(actor, 'order.reviewLink') && <ReviewLinkButton orderId={o.id} />}
          {o.status === 'CANCELLED' && <p className="text-sm text-ink-muted">الطلب ملغى.</p>}
        </section>
      </div>

      <section className="mt-6">
        <h2 className="mb-3 text-lg font-bold">التكليفات وسجل التنفيذ</h2>
        {o.assignments.length === 0 && <p className="card text-ink-muted">لم يُسند بعد.</p>}
        <div className="space-y-3">
          {o.assignments.map((a) => (
            <div key={a.id} className="card space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold">{a.team?.name ?? a.assignee?.name} · {fmtDateTime(a.scheduledStart)} ← {fmtDateTime(a.scheduledEnd)}</div>
                <Badge value={a.status} label={ar.assignment[a.status]} />
              </div>
              {a.pings[0] && (
                <p className="text-sm">
                  آخر موقع شاركه الفريق: {fmtDateTime(a.pings[0].capturedAt)} ·{' '}
                  <a className="link" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps?q=${a.pings[0].lat},${a.pings[0].lng}`}>على الخريطة</a>
                </p>
              )}
              <ol className="space-y-1 border-s-2 border-muted ps-3 text-sm">
                {a.events.map((e) => (
                  <li key={e.id}>
                    <span className="text-ink-muted">{fmtDateTime(e.at)}</span> · {ar.event[e.type] ?? e.type} · {users.get(e.actorId)}
                    {e.note && <span className="text-ink-muted"> — {e.note}</span>}
                  </li>
                ))}
              </ol>
              {a.files.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {a.files.map((f) => (
                    <a key={f.id} href={`/api/v1/files/${f.id}`} target="_blank" className="block text-center text-xs">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/v1/files/${f.id}`} alt={ar.file[f.kind]} className="h-24 w-24 rounded-lg bg-muted object-cover" />
                      {ar.file[f.kind]}{f.signerName && `: ${f.signerName}`}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="card space-y-2">
          <h2 className="font-bold">الشكاوى</h2>
          {o.complaints.length === 0 && <p className="text-sm text-ink-muted">لا توجد شكاوى.</p>}
          {o.complaints.map((c) => (
            <div key={c.id} className="text-sm">
              {managers ? <Link className="link" href="/complaints">CMP-{c.ticketNumber}</Link> : <b>CMP-{c.ticketNumber}</b>} ·{' '}
              <Badge value={c.status} label={ar.complaint[c.status]} /> · {c.description}
            </div>
          ))}
        </div>
        {can(actor, 'complaint.create') && o.status !== 'NEW' && (
          <ApiForm action="/api/v1/complaints" submit="تسجيل شكوى" reset success="سُجّلت الشكوى" className="card space-y-3">
            <input type="hidden" name="orderId" value={o.id} />
            <label className="label" htmlFor="description">شكوى جديدة على هذا الطلب</label>
            <textarea id="description" name="description" className="input min-h-20" required minLength={5} />
          </ApiForm>
        )}
      </section>
    </>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid gap-1 text-sm sm:grid-cols-[9rem_1fr]">
      <div className="font-semibold text-ink-muted">{k}</div>
      <div>{v}</div>
    </div>
  );
}

type Ranked = { id: string; name: string; blocked: boolean; reasons: string[] };

/** الخيار الأول = المقترح. المحجوز يظهر معلَّمًا ولا يُخفى (المشرف قد يغيّر الوقت). */
const optionLabel = (c: Ranked, i: number, extra = '') => `${c.blocked ? '⛔ ' : i === 0 ? '★ مقترح: ' : ''}${c.name}${extra} — ${c.reasons.join('، ')}`;

function AssignForm(p: {
  action: string;
  submit: string;
  start: Date;
  end: Date;
  c: { teams: (Ranked & { capacity: number; zone: string; members: { user: { name: string } }[] })[]; people: Ranked[] };
}) {
  const bestTeam = p.c.teams[0] && !p.c.teams[0].blocked && !(p.c.people[0] && !p.c.people[0].blocked) ? p.c.teams[0].id : '';
  return (
    <ApiForm action={p.action} submit={p.submit} className="space-y-2 pt-2">
      <p className="text-xs text-ink-muted">الترتيب اقتراح بقواعد (التوفر، المنطقة، عبء اليوم) للموعد أدناه — القرار لك، والخادم يمنع أي تضارب.</p>
      <label className="label" htmlFor={`${p.action}-team`}>الفريق</label>
      <select id={`${p.action}-team`} name="teamId" className="input" defaultValue={bestTeam}>
        <option value="">—</option>
        {p.c.teams.map((t, i) => (
          <option key={t.id} value={t.id}>{optionLabel(t, i, `${t.zone ? ` (${t.zone})` : ''} · ${t.members.map((m) => m.user.name).join('، ') || 'بلا أعضاء'}`)}</option>
        ))}
      </select>
      {p.c.people.length > 0 && (
        <>
          <label className="label" htmlFor={`${p.action}-person`}>أو سائق مباشرة</label>
          <select id={`${p.action}-person`} name="assigneeId" className="input">
            <option value="">—</option>
            {p.c.people.map((u, i) => <option key={u.id} value={u.id}>{optionLabel(u, i)}</option>)}
          </select>
        </>
      )}
      <label className="label" htmlFor={`${p.action}-start`}>من</label>
      <input id={`${p.action}-start`} type="datetime-local" name="start" className="input" required defaultValue={toLocalInput(p.start)} />
      <label className="label" htmlFor={`${p.action}-end`}>إلى</label>
      <input id={`${p.action}-end`} type="datetime-local" name="end" className="input" required defaultValue={toLocalInput(p.end)} />
      {p.c.teams.length === 0 && p.c.people.length === 0 && <p className="text-sm text-warn">لا توجد فرق مناسبة لهذا النوع من الخدمة في نطاقك.</p>}
    </ApiForm>
  );
}
