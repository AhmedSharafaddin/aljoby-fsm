import { Badge, Stat, Title } from '@/components/ui';
import { ar } from '@/lib/labels';
import { requirePage } from '@/lib/session';
import { dashboardSummary } from '@/modules/reports';

export const metadata = { title: 'لوحة المؤشرات' };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const actor = await requirePage('dashboard.view');
  const s = await dashboardSummary(actor, (await searchParams).date);
  return (
    <>
      <Title
        action={
          <form className="flex gap-2">
            <input type="date" name="date" defaultValue={s.date} className="input w-auto" aria-label="تاريخ اليوم" />
            <button className="btn-outline">عرض</button>
          </form>
        }
      >
        لوحة المؤشرات
      </Title>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="طلبات اليوم" value={s.today} />
        <Stat label="المكتملة اليوم" value={s.completed} />
        <Stat label="قيد التنفيذ الآن" value={s.inProgress} />
        <Stat label="متأخرة الآن" value={s.late} tone={s.late ? 'danger' : undefined} />
        <Stat label="شكاوى مفتوحة" value={s.complaintsOpen} tone={s.complaintsOpen ? 'danger' : undefined} />
        <Stat label="شكاوى اليوم" value={s.complaintsToday} />
        <Stat label="الالتزام بالموعد (30 يومًا)" value={s.onTimeRate == null ? '—' : `${s.onTimeRate}%`} />
        <Stat label={`رضا العملاء (${s.reviewsCount} تقييم)`} value={s.avgStars == null ? '—' : `${s.avgStars} / 5`} />
        <Stat label="جودة الخدمة حسب العملاء" value={s.avgQuality == null ? '—' : `${s.avgQuality} / 5`} />
        <Stat label="متوسط حل الشكوى (ساعة)" value={s.avgResolutionHours} />
      </div>

      {s.teams.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold">حالة الفرق الآن</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {s.teams.map((t) => (
              <div key={t.id} className="card flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{t.name}</div>
                  <div className="text-xs text-ink-muted">{ar.service[t.type]}{t.zone && ` · ${t.zone}`} · {t.members.join('، ') || 'بلا أعضاء'}</div>
                  <div className="text-xs text-ink-muted">مهام مفتوحة: {t.open} من سعة {t.capacity}</div>
                </div>
                <Badge value={t.state} label={ar.teamState[t.state]} />
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
