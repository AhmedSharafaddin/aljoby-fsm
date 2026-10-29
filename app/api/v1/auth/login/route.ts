import { z } from 'zod';
import { body, errorResponse } from '@/lib/api';
import { login, sessionCookie } from '@/lib/auth';
import { normalizePhone, rateLimit, rateLimitRefund } from '@/lib/core';

export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
    rateLimit(`login:${ip}`, 10, 15 * 60_000);
    const input = z.object({ phone: z.string().min(6).max(20), password: z.string().min(1).max(200) }).parse(await body(req));
    const phone = normalizePhone(input.phone);
    // حد لكل رقم أيضًا: X-Forwarded-For يمكن تزويره بلا وكيل أمامي، فحد الـ IP وحده لا يكفي
    rateLimit(`login-phone:${phone}`, 10, 15 * 60_000);
    const { user, token, expiresAt } = await login(phone, input.password);
    // الحد للإخفاق فقط: الدخول الناجح لا يستهلكه، وإلا حُجب مستخدمو الفرع أو الشبكة المشتركة بعد 10 دخولات
    rateLimitRefund(`login:${ip}`);
    rateLimitRefund(`login-phone:${phone}`);
    return Response.json(
      { data: { id: user.id, name: user.name, role: user.role } },
      { headers: { 'Set-Cookie': sessionCookie(token, expiresAt) } },
    );
  } catch (e) {
    return errorResponse(e, req);
  }
}
