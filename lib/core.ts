// البنية المشتركة: قاعدة البيانات، الأخطاء، الوقت، الهاتف، التدقيق.
import { Prisma, PrismaClient } from '@prisma/client';
import { ZodError } from 'zod';

const g = globalThis as unknown as { prisma?: PrismaClient };
export const db = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') g.prisma = db;

export type Tx = Prisma.TransactionClient;

/** خطأ أعمال يُترجم مباشرة إلى رد HTTP. الرسالة عربية وآمنة للعرض. */
export class AppError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 422 | 429, message: string) {
    super(message);
  }
}
export const notFound = () => new AppError(404, 'غير موجود أو لا تملك صلاحية الوصول إليه');
export const forbidden = () => new AppError(403, 'لا تملك صلاحية تنفيذ هذا الإجراء');
export const conflict = (m: string) => new AppError(409, m);

/** للصفحات: «غير موجود» (404 أو معرّف مشوّه) يصير null، وأي خطأ آخر (قاعدة بيانات…) يُرفع ولا يُخفى. */
export function nullIfNotFound(e: unknown): null {
  if ((e instanceof AppError && e.status === 404) || e instanceof ZodError) return null;
  throw e;
}

// ---- الوقت: يُخزَّن UTC، والأيام تُحسب بمنطقة الشركة ----
export const APP_TZ = process.env.APP_TZ || 'Asia/Aden';

/** إزاحة المنطقة عند لحظة معيّنة، مثل "+03:00" — تصح مع التوقيت الصيفي أيضًا. */
function tzOffset(at: Date): string {
  const name = new Intl.DateTimeFormat('en', { timeZone: APP_TZ, timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')!.value; // "GMT+03:00" أو "GMT"
  return name === 'GMT' ? '+00:00' : name.slice(3);
}

/** "2026-10-28T09:00" من حقل datetime-local ← لحظة UTC بتوقيت الشركة. */
export function parseLocal(value: string): Date {
  const approx = new Date(value + 'Z');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value) || Number.isNaN(approx.getTime())) {
    throw new AppError(422, 'تاريخ غير صالح');
  }
  return new Date(`${value.length === 16 ? value + ':00' : value}${tzOffset(approx)}`);
}

/** تاريخ اليوم YYYY-MM-DD بتوقيت الشركة. */
export function localDate(at = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TZ }).format(at);
}

/** [بداية اليوم، بداية اليوم التالي) لتاريخ محلي. */
export function dayRange(date: string): { gte: Date; lt: Date } {
  const gte = parseLocal(`${date}T00:00`);
  return { gte, lt: new Date(gte.getTime() + 24 * 3600_000) };
}

/** للعرض في حقل datetime-local. */
export function toLocalInput(at: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: APP_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(at).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/**
 * أول موعد مقترح للجدولة: الساعة الكاملة التالية من (التاريخ المطلوب أو الآن)، داخل الدوام.
 * ponytail: دوام ثابت 8:00–17:00 بتوقيت الشركة؛ اجعله إعدادًا إن اختلف بين الفروع.
 */
export function proposedStart(requested: Date, now = new Date()): Date {
  const t = new Date(Math.ceil(Math.max(requested.getTime(), now.getTime()) / 3600_000) * 3600_000);
  const hour = Number(toLocalInput(t).slice(11, 13));
  if (hour < 8) return parseLocal(`${localDate(t)}T09:00`);
  if (hour >= 17) return parseLocal(`${localDate(new Date(t.getTime() + 86400_000))}T09:00`);
  return t;
}

export function fmtDateTime(at: Date | null | undefined): string {
  if (!at) return '—';
  return new Intl.DateTimeFormat('ar', { timeZone: APP_TZ, dateStyle: 'medium', timeStyle: 'short' }).format(at);
}

// ---- الهاتف ----
/**
 * منقولة من تطبيق الجوبي (src/domain/whatsapp.ts) — نفس القاعدة في المنظومتين:
 * أي صيغة يكتبها إنسان تتحول إلى أرقام دولية صالحة لـ wa.me.
 */
export function normalizePhone(raw: string, countryCode = process.env.COUNTRY_CODE || '967'): string {
  const cc = countryCode.replace(/\D+/g, '');
  const trimmed = raw.trim();
  const explicitlyInternational = trimmed.startsWith('+') || /^00\d/.test(trimmed.replace(/[\s()\-.]/g, ''));
  const digits = trimmed.replace(/\D+/g, '');
  if (digits === '') return '';
  if (explicitlyInternational) return digits.replace(/^00/, '');
  const national = digits.replace(/^0+/, '');
  if (national === '') return '';
  return national.startsWith(cc) && national.length >= cc.length + 8 ? national : `${cc}${national}`;
}

export const waLink = (phone: string, text: string) => `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(text)}`;

// ---- التدقيق ----
export function audit(tx: Tx, actorId: string | null, entityType: string, entityId: string, action: string, data?: Prisma.InputJsonValue) {
  return tx.auditLog.create({ data: { actorId, entityType, entityId, action, data } });
}

// ponytail: محدِّد معدل في الذاكرة لكل عملية — يكفي لخادم واحد؛ انقله إلى Redis/الجدول عند تعدد النسخ.
const hits = new Map<string, number[]>();
const LONGEST_WINDOW_MS = 3600_000; // أطول نافذة مستخدمة (التقييم: ساعة)
export const rateLimitSize = () => hits.size;
export function rateLimit(key: string, max: number, windowMs: number, now = Date.now()) {
  // تنظيف المفاتيح القديمة كي لا تكبر الذاكرة مع كل IP/رقم جديد
  if (hits.size > 1000) {
    for (const [k, times] of hits) if (now - times[times.length - 1] > LONGEST_WINDOW_MS) hits.delete(k);
  }
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) throw new AppError(429, 'محاولات كثيرة، حاول بعد قليل');
  recent.push(now);
  hits.set(key, recent);
}
