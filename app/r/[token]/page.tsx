import { ApiForm } from '@/components/client';
import { ar } from '@/lib/labels';
import { reviewTarget } from '@/modules/service';

export const metadata = { title: 'تقييم الخدمة', robots: { index: false } };

// صفحة عامة بلا حساب: الرابط المرسل عبر واتساب هو الإذن، صالح 7 أيام ولمرة واحدة.
export default async function Review({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const order = await reviewTarget(token);
  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <div className="card w-full max-w-md space-y-4 p-6">
        <div className="text-center">
          <div className="text-xs font-semibold tracking-widest text-gold">الجوبي · ١٩٧٩</div>
          <h1 className="mt-1 text-2xl font-bold text-brand">قيّم خدمتنا</h1>
        </div>
        {!order ? (
          <p className="text-center text-ink-muted">هذا الرابط غير صالح أو انتهت صلاحيته.</p>
        ) : order.done ? (
          <p role="status" className="text-center text-lg font-semibold text-brand">شكرًا لك! وصلنا تقييمك.</p>
        ) : (
          <ApiForm action={`/api/v1/public/reviews/${token}`} submit="إرسال التقييم" success="شكرًا لك! وصلنا تقييمك." className="space-y-4">
            <p className="text-center text-sm text-ink-muted">طلب #{order.number} · {ar.service[order.serviceType]}</p>
            <Stars name="stars" label="تقييمك العام" />
            <Stars name="punctuality" label="الالتزام بالموعد" />
            <Stars name="serviceQuality" label="جودة الخدمة" />
            <div>
              <label className="label" htmlFor="notes">ملاحظاتك (اختياري)</label>
              <textarea id="notes" name="notes" className="input" maxLength={1000} />
            </div>
          </ApiForm>
        )}
      </div>
    </main>
  );
}

function Stars({ name, label }: { name: string; label: string }) {
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="flex flex-row-reverse justify-end gap-1">
        {[5, 4, 3, 2, 1].map((n) => (
          <label key={n} className="cursor-pointer">
            <input type="radio" name={name} value={n} required className="peer sr-only" aria-label={`${label}: ${n} من 5`} />
            <span aria-hidden className="grid h-11 w-11 place-items-center rounded-lg text-2xl ring-1 ring-black/10 peer-checked:bg-gold peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-brand">
              {n}★
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
