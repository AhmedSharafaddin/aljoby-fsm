// قواعد الأعمال الخالصة (بلا قاعدة بيانات) — تُختبر وحدها في tests/rules.test.ts.
import type { ComplaintStatus, FileKind, OrderStatus, ServiceType, TripStatus } from '@prisma/client';

export const ACTIVE_ASSIGNMENT = ['ASSIGNED', 'IN_PROGRESS', 'ISSUE'] as const;
export const OPEN_ORDER: OrderStatus[] = ['NEW', 'APPROVED', 'SCHEDULED', 'IN_PROGRESS', 'ON_HOLD', 'ISSUE_REPORTED'];

/** الانتقالات المسموحة لحالة الطلب. أي انتقال آخر يرفضه الخادم. */
const ORDER_FLOW: Record<OrderStatus, OrderStatus[]> = {
  NEW: ['APPROVED', 'CANCELLED'],
  APPROVED: ['SCHEDULED', 'ON_HOLD', 'CANCELLED'],
  SCHEDULED: ['SCHEDULED', 'IN_PROGRESS', 'ISSUE_REPORTED', 'ON_HOLD', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'ISSUE_REPORTED'],
  ISSUE_REPORTED: ['IN_PROGRESS', 'SCHEDULED', 'ON_HOLD', 'CANCELLED'],
  ON_HOLD: ['APPROVED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};
export const canMoveOrder = (from: OrderStatus, to: OrderStatus) => ORDER_FLOW[from].includes(to);

export const TRIP_STEPS: TripStatus[] = ['ASSIGNED', 'LOADED', 'DEPARTED', 'ARRIVED', 'DELIVERED'];
/** الرحلة تتقدم خطوة واحدة فقط في كل مرة. */
export const nextTripStep = (s: TripStatus): TripStatus | null => TRIP_STEPS[TRIP_STEPS.indexOf(s) + 1] ?? null;

export const COMPLAINT_STEPS: ComplaintStatus[] = ['NEW', 'IN_PROGRESS', 'CONTACTED', 'RESOLVED', 'CLOSED'];
/** الشكوى تتقدم للأمام (يجوز تخطي مرحلة)؛ الرجوع للمدير العام فقط ومع سبب. */
export function complaintMoveAllowed(from: ComplaintStatus, to: ComplaintStatus, isAdmin: boolean, reason?: string) {
  const d = COMPLAINT_STEPS.indexOf(to) - COMPLAINT_STEPS.indexOf(from);
  if (d > 0) return true;
  return d < 0 && isAdmin && !!reason?.trim();
}

/** ما الذي ينقص لإتمام المهمة حسب نوع الخدمة (قائمة فارغة = جاهزة). */
export function completionMissing(
  type: ServiceType,
  files: { kind: FileKind }[],
  carpet?: { quantityReceived: unknown; quantityUsed: unknown } | null,
): string[] {
  const has = (k: FileKind) => files.some((f) => f.kind === k);
  const missing: string[] = [];
  if (type !== 'DELIVERY') {
    if (!has('BEFORE')) missing.push('صورة قبل التنفيذ');
    if (!has('AFTER')) missing.push('صورة بعد التنفيذ');
  }
  if (!has('SIGNATURE')) missing.push('توقيع العميل');
  if (type === 'CARPET' && (carpet?.quantityReceived == null || carpet?.quantityUsed == null)) {
    missing.push('الكمية المستلمة والمستخدمة من الموكيت');
  }
  return missing;
}

/** الهدر = المستلم − المستخدم. يرفض السالب أو استخدام أكثر من المستلم. */
export function carpetWaste(received: number, used: number): number {
  if (received < 0 || used < 0) throw new RangeError('لا تُقبل كميات سالبة');
  if (used > received) throw new RangeError('الكمية المستخدمة أكبر من المستلمة');
  return Math.round((received - used) * 100) / 100;
}

/**
 * التأخير: يُقارن نهاية الموعد المعتمد (scheduledEnd) بوقت الإتمام الفعلي،
 * أو بالوقت الحالي إن لم يكتمل الطلب بعد. الطلب الملغى أو المعلّق أو غير المجدول لا يُعد متأخرًا.
 */
export function isLate(o: { status: OrderStatus; scheduledEnd: Date | null; completedAt: Date | null }, now = new Date()) {
  if (!o.scheduledEnd || o.status === 'CANCELLED' || o.status === 'ON_HOLD') return false;
  if (o.status === 'COMPLETED') return !!o.completedAt && o.completedAt > o.scheduledEnd;
  return now > o.scheduledEnd;
}

/**
 * اقتراح الفريق بقواعد واضحة يقرأها المشرف (لا ذكاء اصطناعي)، والقرار له:
 * المحجوز في الموعد يُستبعد، ثم: نفس المنطقة +3، مكان شاغر في الموعد +2، وكل مهمة في نفس اليوم −1.
 */
export function rankCandidates<T extends { zone: string; capacity: number; busyAtSlot: number; loadToday: number }>(
  candidates: T[],
  address: string,
): (T & { score: number; blocked: boolean; reasons: string[] })[] {
  return candidates
    .map((c) => {
      const blocked = c.busyAtSlot >= c.capacity;
      const reasons: string[] = [];
      let score = 0;
      if (blocked) reasons.push('محجوز في هذا الموعد');
      else {
        score += 2;
        reasons.push('متاح في الموعد');
      }
      if (c.zone && address.includes(c.zone)) {
        score += 3;
        reasons.push('نفس المنطقة');
      }
      score -= c.loadToday;
      reasons.push(c.loadToday ? `${c.loadToday} مهام في اليوم` : 'لا مهام في اليوم');
      return { ...c, score, blocked, reasons };
    })
    .sort((a, b) => Number(a.blocked) - Number(b.blocked) || b.score - a.score);
}

/** تداخل فترتين [a,b) و[c,d). */
export const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) => aStart < bEnd && bStart < aEnd;
