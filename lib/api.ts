// غلاف موحّد لمسارات /api/v1: فحص المصدر (CSRF)، المصادقة، وتحويل الأخطاء إلى JSON.
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { type Actor, requireActor } from './auth';
import { AppError } from './core';

type Ctx = { params: Promise<Record<string, string>> };
type Handler = (args: { req: Request; actor: Actor; params: Record<string, string> }) => Promise<unknown>;

/** طلبات التعديل يجب أن تأتي من نفس الموقع (مع SameSite=Lax يغلق هذا باب CSRF). */
function assertSameOrigin(req: Request) {
  if (req.method === 'GET' || req.method === 'HEAD') return;
  const origin = req.headers.get('origin');
  if (!origin) return; // عملاء غير المتصفح لا يرسلون Origin ولا يحملون كوكي من موقع آخر
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? new URL(req.url).host;
  // "null" (إطار معزول) أو قيمة تالفة = مصدر غير موثوق
  const originHost = URL.canParse(origin) ? new URL(origin).host : null;
  if (originHost !== host) throw new AppError(403, 'مصدر الطلب غير مسموح');
}

/** معرّف الطلب من الوكيل إن كان سليمًا، وإلا معرّف جديد — القيمة تدخل السجل فلا نقبل نصًا حرًا. */
const requestId = (req: Request) => {
  const given = req.headers.get('x-request-id');
  return given && /^[\w-]{1,64}$/.test(given) ? given : randomUUID();
};

/** رد الخطأ يحمل x-request-id، فيطابق ما يبلّغ عنه المستخدم سطرًا واحدًا في السجل. */
export function errorResponse(e: unknown, req: Request): Response {
  const id = requestId(req);
  const headers = { 'x-request-id': id };
  if (e instanceof AppError) return Response.json({ error: e.message }, { status: e.status, headers });
  if (e instanceof ZodError) {
    const first = e.issues[0];
    return Response.json(
      { error: first?.message && !first.message.startsWith('Invalid') ? first.message : 'بيانات غير صالحة', fields: e.issues.map((i) => i.path.join('.')) },
      { status: 422, headers },
    );
  }
  if ((e as { code?: string })?.code === 'P2002') return Response.json({ error: 'السجل موجود مسبقًا' }, { status: 409, headers });
  // بلا محتوى الطلب ولا الاستعلام
  console.error(JSON.stringify({ level: 'error', requestId: id, method: req.method, path: new URL(req.url).pathname, name: (e as Error)?.name, message: (e as Error)?.message }));
  return Response.json({ error: 'خطأ غير متوقع في الخادم' }, { status: 500, headers });
}

/** مسار محمي: يحتاج جلسة صالحة. ما يُرجعه الـ handler يُلف في { data }. */
export function route(handler: Handler) {
  return async (req: Request, ctx: Ctx) => {
    try {
      assertSameOrigin(req);
      const actor = await requireActor(req);
      const out = await handler({ req, actor, params: (await ctx?.params) ?? {} });
      return out instanceof Response ? out : Response.json({ data: out ?? null });
    } catch (e) {
      return errorResponse(e, req);
    }
  };
}

export const body = async (req: Request): Promise<unknown> => req.json().catch(() => ({}));
export const query = (req: Request) => Object.fromEntries(new URL(req.url).searchParams);
