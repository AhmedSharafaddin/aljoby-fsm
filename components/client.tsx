'use client';
// مكونات تفاعلية صغيرة: كل تعديل يمر عبر /api/v1 ثم تُحدَّث الصفحة من الخادم.
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

async function call(url: string, method: string, body?: unknown | FormData) {
  const res = await fetch(url, {
    method,
    headers: body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- إعادة تحميل كاملة متعمّدة: تصفّر حالة الجلسة والذاكرة المؤقتة
  if (res.status === 401) window.location.href = '/login';
  if (!res.ok) throw new Error(json.error ?? 'تعذّر تنفيذ الطلب، تحقق من الاتصال');
  return json.data;
}

/** الحقول الفارغة تُحذف، و"true"/"false" تصير منطقية — الباقي تتحقق منه zod في الخادم. */
function formToJson(form: HTMLFormElement) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of new FormData(form)) {
    if (typeof v !== 'string' || v.trim() === '') continue;
    out[k] = v === 'true' ? true : v === 'false' ? false : v;
  }
  return out;
}

function Status({ error, ok }: { error?: string; ok?: string }) {
  if (error) return <p role="alert" className="rounded-lg bg-danger/10 p-2 text-sm text-danger">{error}</p>;
  if (ok) return <p role="status" className="rounded-lg bg-brand/10 p-2 text-sm text-brand">{ok}</p>;
  return null;
}

export function ApiForm(props: {
  action: string;
  method?: 'POST' | 'PATCH';
  submit: string;
  children: React.ReactNode;
  redirect?: string; // يدعم :id من الرد
  success?: string;
  reset?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [ok, setOk] = useState<string>();
  return (
    <form
      className={props.className ?? 'space-y-3'}
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        setBusy(true);
        setError(undefined);
        setOk(undefined);
        try {
          const data = await call(props.action, props.method ?? 'POST', formToJson(form));
          if (props.redirect) return router.push(props.redirect.replace(':id', data?.id ?? ''));
          if (props.reset) form.reset();
          setOk(props.success ?? 'تم الحفظ');
          router.refresh();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {props.children}
      <Status error={error} ok={ok} />
      <button className="btn" disabled={busy}>{busy ? 'جارٍ الحفظ…' : props.submit}</button>
    </form>
  );
}

export function ApiButton(props: {
  action: string;
  label: string;
  body?: Record<string, unknown>;
  confirm?: string;
  askReason?: string; // يطلب سببًا ويرسله كـ reason
  variant?: 'btn' | 'btn-outline' | 'btn-danger';
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        className={props.variant ?? 'btn'}
        disabled={busy}
        onClick={async () => {
          if (props.confirm && !window.confirm(props.confirm)) return;
          let body = props.body ?? {};
          if (props.askReason) {
            const reason = window.prompt(props.askReason);
            if (!reason) return;
            body = { ...body, reason, note: reason };
          }
          setBusy(true);
          setError(undefined);
          try {
            await call(props.action, 'POST', body);
            router.refresh();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? '…' : props.label}
      </button>
      <Status error={error} />
    </span>
  );
}

export function LoginForm() {
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(undefined);
        try {
          await call('/api/v1/auth/login', 'POST', formToJson(e.currentTarget));
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- إعادة تحميل كاملة متعمّدة: تصفّر حالة الجلسة والذاكرة المؤقتة
          window.location.href = '/';
        } catch (err) {
          setError((err as Error).message);
          setBusy(false);
        }
      }}
    >
      <div>
        <label className="label" htmlFor="phone">رقم الهاتف</label>
        <input id="phone" name="phone" className="input" inputMode="tel" autoComplete="username" required dir="ltr" />
      </div>
      <div>
        <label className="label" htmlFor="password">كلمة المرور</label>
        <input id="password" name="password" type="password" className="input" autoComplete="current-password" required dir="ltr" />
      </div>
      <Status error={error} />
      <button className="btn w-full" disabled={busy}>{busy ? 'جارٍ الدخول…' : 'دخول'}</button>
    </form>
  );
}

export function LogoutButton() {
  return (
    <button
      className="-my-3 py-3 text-sm font-semibold underline-offset-4 hover:underline" // مساحة لمس 44px بنفس الشكل
      onClick={async () => {
        await fetch('/api/v1/auth/logout', { method: 'POST' });
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- إعادة تحميل كاملة متعمّدة: تصفّر حالة الجلسة والذاكرة المؤقتة
        window.location.href = '/login';
      }}
    >
      خروج
    </button>
  );
}

/** رفع صورة دليل من كاميرا الهاتف مباشرة. */
export function PhotoUpload({ taskId, kind, label }: { taskId: string; kind: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <div className="space-y-1">
      <label className={`btn-outline w-full cursor-pointer ${busy ? 'opacity-50' : ''}`}>
        {busy ? 'جارٍ الرفع…' : label}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          className="sr-only"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const fd = new FormData();
            fd.set('kind', kind);
            fd.set('file', file);
            setBusy(true);
            setError(undefined);
            try {
              await call(`/api/v1/field/tasks/${taskId}/files`, 'POST', fd);
              router.refresh();
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
              e.target.value = '';
            }
          }}
        />
      </label>
      <Status error={error} />
    </div>
  );
}

/** توقيع العميل بالإصبع على canvas، يُرفع PNG. */
export function SignaturePad({ taskId }: { taskId: string }) {
  const router = useRouter();
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [signed, setSigned] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const c = ref.current!;
    c.width = c.offsetWidth * 2;
    c.height = c.offsetHeight * 2;
    const ctx = c.getContext('2d')!;
    ctx.scale(2, 2);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1E1A17';
  }, []);

  const point = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  const clear = () => {
    const c = ref.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setSigned(false);
  };

  return (
    <div className="space-y-2">
      <canvas
        ref={ref}
        aria-label="مساحة توقيع العميل"
        className="h-40 w-full touch-none rounded-lg border-2 border-dashed border-black/20 bg-white"
        onPointerDown={(e) => {
          drawing.current = true;
          const ctx = ref.current!.getContext('2d')!;
          ctx.beginPath();
          ctx.moveTo(...point(e));
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = ref.current!.getContext('2d')!;
          ctx.lineTo(...point(e));
          ctx.stroke();
          setSigned(true);
        }}
        onPointerUp={() => (drawing.current = false)}
        onPointerLeave={() => (drawing.current = false)}
      />
      <input className="input" placeholder="اسم المستلم" value={name} onChange={(e) => setName(e.target.value)} />
      <Status error={error} />
      <div className="flex gap-2">
        <button
          className="btn flex-1"
          disabled={!signed || !name.trim() || busy}
          onClick={async () => {
            setBusy(true);
            setError(undefined);
            try {
              const blob = await new Promise<Blob>((ok) => ref.current!.toBlob((b) => ok(b!), 'image/png'));
              const fd = new FormData();
              fd.set('kind', 'SIGNATURE');
              fd.set('signerName', name);
              fd.set('file', new File([blob], 'signature.png', { type: 'image/png' }));
              await call(`/api/v1/field/tasks/${taskId}/files`, 'POST', fd);
              clear();
              router.refresh();
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          حفظ التوقيع
        </button>
        <button className="btn-outline" type="button" onClick={clear}>مسح</button>
      </div>
    </div>
  );
}

/** مشاركة الموقع مرة واحدة بطلب الموظف — لا تتبع مستمر. */
export function ShareLocation({ taskId }: { taskId: string }) {
  const [state, setState] = useState<{ error?: string; ok?: string }>({});
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-1">
      <button
        className="btn-outline w-full"
        disabled={busy}
        onClick={() => {
          if (!navigator.geolocation) return setState({ error: 'المتصفح لا يدعم تحديد الموقع' });
          setBusy(true);
          navigator.geolocation.getCurrentPosition(
            async (p) => {
              try {
                await call('/api/v1/locations', 'POST', { assignmentId: taskId, lat: p.coords.latitude, lng: p.coords.longitude });
                setState({ ok: 'أُرسل موقعك للمشرف' });
              } catch (err) {
                setState({ error: (err as Error).message });
              } finally {
                setBusy(false);
              }
            },
            () => {
              setBusy(false);
              setState({ error: 'لم يُسمح بالوصول للموقع — باقي المهمة يعمل عاديًا' });
            },
            { enableHighAccuracy: true, timeout: 15_000 },
          );
        }}
      >
        {busy ? 'جارٍ تحديد الموقع…' : 'مشاركة موقعي الحالي مع المشرف'}
      </button>
      <p className="text-xs text-ink-muted">يُرسل مرة واحدة لهذه المهمة فقط، ولا يُتتبَّع موقعك في الخلفية.</p>
      <Status {...state} />
    </div>
  );
}

export function ReviewLinkButton({ orderId }: { orderId: string }) {
  const [link, setLink] = useState<{ url: string; whatsapp: string }>();
  const [error, setError] = useState<string>();
  if (link)
    return (
      <div className="space-y-2">
        <a className="btn" href={link.whatsapp} target="_blank" rel="noopener noreferrer">إرسال عبر واتساب</a>
        <p className="break-all text-xs text-ink-muted" dir="ltr">{link.url}</p>
      </div>
    );
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        className="btn-outline"
        onClick={async () => {
          try {
            setLink(await call(`/api/v1/orders/${orderId}/review-link`, 'POST', {}));
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        رابط تقييم العميل
      </button>
      <Status error={error} />
    </span>
  );
}
