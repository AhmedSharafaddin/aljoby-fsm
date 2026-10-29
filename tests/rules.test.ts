// اختبارات وحدة لمنطق الحالات والهدر والوقت والصلاحيات — بلا قاعدة بيانات.
import { describe, expect, it } from 'vitest';
import { dayRange, normalizePhone, parseLocal, proposedStart, rateLimit, rateLimitSize } from '@/lib/core';
import { can, orderScope } from '@/lib/permissions';
import { sniffImage } from '@/lib/storage';
import { toCsv } from '@/modules/reports';
import { canMoveOrder, carpetWaste, complaintMoveAllowed, completionMissing, isLate, nextTripStep, overlaps, rankCandidates } from '@/modules/rules';

const at = (s: string) => new Date(s);

// صور سليمة أصغر ما يمكن (1×1) لاختبار فحص الصور
const PNG_1X1 = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
const JPEG_1X1 = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xd9]);
const WEBP_1X1 = new Uint8Array([...'RIFF'].map((c) => c.charCodeAt(0)).concat([18, 0, 0, 0], [...'WEBPVP8L'].map((c) => c.charCodeAt(0)), [5, 0, 0, 0, 0x2f, 0, 0, 0, 0, 0]));
/** PNG سليم بعد تغيير العرض والارتفاع في ترويسة IHDR. */
function withPngSize(w: number, h: number) {
  const b = PNG_1X1.slice();
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
}

describe('حالات الطلب', () => {
  it('يسمح بالمسار الأساسي ويمنع القفز', () => {
    expect(canMoveOrder('NEW', 'APPROVED')).toBe(true);
    expect(canMoveOrder('APPROVED', 'SCHEDULED')).toBe(true);
    expect(canMoveOrder('IN_PROGRESS', 'COMPLETED')).toBe(true);
    expect(canMoveOrder('NEW', 'COMPLETED')).toBe(false);
    expect(canMoveOrder('SCHEDULED', 'COMPLETED')).toBe(false);
    expect(canMoveOrder('COMPLETED', 'CANCELLED')).toBe(false);
    expect(canMoveOrder('IN_PROGRESS', 'CANCELLED')).toBe(false);
  });
  it('الرحلة خطوة واحدة في كل مرة', () => {
    expect(nextTripStep('ASSIGNED')).toBe('LOADED');
    expect(nextTripStep('ARRIVED')).toBe('DELIVERED');
    expect(nextTripStep('DELIVERED')).toBeNull();
  });
  it('الشكوى للأمام فقط إلا للمدير العام مع سبب', () => {
    expect(complaintMoveAllowed('NEW', 'CONTACTED', false)).toBe(true);
    expect(complaintMoveAllowed('RESOLVED', 'IN_PROGRESS', false, 'x')).toBe(false);
    expect(complaintMoveAllowed('RESOLVED', 'IN_PROGRESS', true)).toBe(false);
    expect(complaintMoveAllowed('RESOLVED', 'IN_PROGRESS', true, 'العميل عاد')).toBe(true);
  });
});

describe('شروط الإتمام', () => {
  it('الأثاث يحتاج قبل وبعد وتوقيع', () => {
    expect(completionMissing('FURNITURE', [])).toHaveLength(3);
    expect(completionMissing('FURNITURE', [{ kind: 'BEFORE' }, { kind: 'AFTER' }, { kind: 'SIGNATURE' }])).toEqual([]);
  });
  it('التوصيل يحتاج التوقيع فقط', () => {
    expect(completionMissing('DELIVERY', [{ kind: 'SIGNATURE' }])).toEqual([]);
  });
  it('الموكيت يحتاج الكميات', () => {
    const files = [{ kind: 'BEFORE' as const }, { kind: 'AFTER' as const }, { kind: 'SIGNATURE' as const }];
    expect(completionMissing('CARPET', files, { quantityReceived: null, quantityUsed: null })).toHaveLength(1);
    expect(completionMissing('CARPET', files, { quantityReceived: 10, quantityUsed: 9 })).toEqual([]);
  });
});

describe('الهدر', () => {
  it('المستلم − المستخدم', () => expect(carpetWaste(52.5, 48.25)).toBe(4.25));
  it('يرفض السالب والاستخدام الزائد', () => {
    expect(() => carpetWaste(-1, 0)).toThrow();
    expect(() => carpetWaste(10, 11)).toThrow();
  });
});

describe('التأخير والوقت', () => {
  const end = at('2026-10-28T12:00:00Z');
  it('المفتوح بعد نهاية الموعد متأخر', () => {
    expect(isLate({ status: 'IN_PROGRESS', scheduledEnd: end, completedAt: null }, at('2026-10-28T12:01:00Z'))).toBe(true);
    expect(isLate({ status: 'SCHEDULED', scheduledEnd: end, completedAt: null }, at('2026-10-28T11:00:00Z'))).toBe(false);
  });
  it('المكتمل يُقارن بوقت الإتمام لا بالآن', () => {
    expect(isLate({ status: 'COMPLETED', scheduledEnd: end, completedAt: at('2026-10-28T11:59:00Z') }, at('2027-01-01'))).toBe(false);
    expect(isLate({ status: 'COMPLETED', scheduledEnd: end, completedAt: at('2026-10-28T12:30:00Z') })).toBe(true);
  });
  it('الملغى وغير المجدول لا يتأخر', () => {
    expect(isLate({ status: 'CANCELLED', scheduledEnd: end, completedAt: null })).toBe(false);
    expect(isLate({ status: 'APPROVED', scheduledEnd: null, completedAt: null })).toBe(false);
  });
  it('المعلّق لا يُعد متأخرًا ولو تجاوز موعده', () => {
    expect(isLate({ status: 'ON_HOLD', scheduledEnd: end, completedAt: null }, at('2027-01-01'))).toBe(false);
  });
  it('اليوم يُحسب بتوقيت عدن (+03:00)', () => {
    expect(parseLocal('2026-10-28T09:00').toISOString()).toBe('2026-10-28T06:00:00.000Z');
    const r = dayRange('2026-10-28');
    expect(r.gte.toISOString()).toBe('2026-10-27T21:00:00.000Z');
    expect(r.lt.getTime() - r.gte.getTime()).toBe(86400_000);
  });
  it('الموعد المقترح داخل الدوام', () => {
    const iso = (d: Date) => d.toISOString();
    const past = at('2026-01-01T00:00Z');
    // 10:20 بتوقيت عدن ← 11:00
    expect(iso(proposedStart(past, at('2026-10-28T07:20Z')))).toBe('2026-10-28T08:00:00.000Z');
    // 23:40 ← 9:00 من الغد
    expect(iso(proposedStart(past, at('2026-10-28T20:40Z')))).toBe('2026-10-29T06:00:00.000Z');
    // 5:10 فجرًا ← 9:00 نفس اليوم
    expect(iso(proposedStart(past, at('2026-10-28T02:10Z')))).toBe('2026-10-28T06:00:00.000Z');
    // تاريخ مطلوب في المستقبل يُحترم
    expect(iso(proposedStart(parseLocal('2026-11-05T00:00'), at('2026-10-28T07:20Z')))).toBe('2026-11-05T06:00:00.000Z');
  });
  it('التداخل الزمني', () => {
    expect(overlaps(at('2026-01-01T09:00Z'), at('2026-01-01T12:00Z'), at('2026-01-01T11:00Z'), at('2026-01-01T13:00Z'))).toBe(true);
    expect(overlaps(at('2026-01-01T09:00Z'), at('2026-01-01T12:00Z'), at('2026-01-01T12:00Z'), at('2026-01-01T13:00Z'))).toBe(false);
  });
});

describe('اقتراح الفريق', () => {
  const t = (id: string, o: Partial<{ zone: string; capacity: number; busyAtSlot: number; loadToday: number }> = {}) => ({
    id, zone: '', capacity: 1, busyAtSlot: 0, loadToday: 0, ...o,
  });
  it('المحجوز في الموعد آخرًا مهما كانت نقاطه', () => {
    const r = rankCandidates([t('busy', { zone: 'حدة', busyAtSlot: 1 }), t('free', { loadToday: 3 })], 'صنعاء حدة');
    expect(r.map((x) => x.id)).toEqual(['free', 'busy']);
    expect(r[1].blocked).toBe(true);
  });
  it('نفس المنطقة ثم الأقل عبئًا، مع أسباب مقروءة', () => {
    const r = rankCandidates([t('a', { loadToday: 2 }), t('b', { zone: 'حدة' }), t('c')], 'صنعاء — شارع حدة');
    expect(r.map((x) => x.id)).toEqual(['b', 'c', 'a']);
    expect(r[0].reasons).toContain('نفس المنطقة');
  });
  it('السعة الأكبر تقبل مهمة متداخلة', () => {
    expect(rankCandidates([t('x', { capacity: 2, busyAtSlot: 1 })], '')[0].blocked).toBe(false);
  });
});

describe('الصلاحيات', () => {
  const a = (role: Parameters<typeof can>[0]['role'], branchId: string | null = null) => ({ id: 'u1', name: 'x', role, branchId });
  it('القدرات حسب الدور', () => {
    expect(can(a('BRANCH'), 'order.create')).toBe(true);
    expect(can(a('BRANCH'), 'order.approve')).toBe(false);
    expect(can(a('INSTALLER'), 'order.create')).toBe(false);
    expect(can(a('SUPERVISOR'), 'order.assign')).toBe(true);
    expect(can(a('SUPERVISOR'), 'report.view')).toBe(false);
    expect(can(a('DRIVER'), 'field.work')).toBe(true);
  });
  it('الفرع يرى فرعه فقط، والفرع بلا ربط لا يرى شيئًا', () => {
    expect(orderScope(a('BRANCH', 'b1'))).toEqual({ branchId: 'b1' });
    expect(orderScope(a('BRANCH'))).not.toEqual({});
    expect(orderScope(a('ADMIN'))).toEqual({});
  });
});

describe('أدوات', () => {
  it('تطبيع الهاتف بنفس قاعدة تطبيق الجوال', () => {
    for (const p of ['+967 78 505 5551', '00967785055551', '0785055551', '785055551', '967785055551']) {
      expect(normalizePhone(p)).toBe('967785055551');
    }
  });
  it('CSV: BOM، اقتباس، ومنع حقن الصيغ', () => {
    const csv = toCsv([{ a: 'x,y', b: '=HYPERLINK("evil")' }]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"x,y"');
    expect(csv).toContain(`"'=HYPERLINK(""evil"")"`);
  });
  it('CSV: أعمدة كل الصفوف لا الصف الأول فقط', () => {
    const csv = toCsv([{ name: 'سائق', trips: 2 }, { name: 'معلم', pieces: 7 }]);
    expect(csv.split('\r\n')[0]).toBe('﻿name,trips,pieces');
    expect(csv.split('\r\n')[2]).toBe('معلم,,7');
  });
  it('CSV: يمنع الصيغ التي تبدأ بـ Tab أو CR أيضًا', () => {
    const lines = toCsv([{ a: '\tcmd', b: '\r=1+1' }]).split('\r\n');
    expect(lines[1]).toBe("'\tcmd,\"'\r=1+1\"");
  });
  it('ذاكرة محدد المعدل لا تكبر بلا حد', () => {
    const t0 = Date.parse('2026-01-01T00:00:00Z');
    for (let i = 0; i < 1500; i++) rateLimit('k' + i, 5, 60_000, t0);
    rateLimit('later', 5, 60_000, t0 + 2 * 3600_000);
    expect(rateLimitSize()).toBeLessThan(10);
  });
  it('فحص نوع الصورة من البايتات', () => {
    expect(sniffImage(PNG_1X1)?.mime).toBe('image/png');
    expect(sniffImage(JPEG_1X1)?.mime).toBe('image/jpeg');
    expect(sniffImage(WEBP_1X1)?.mime).toBe('image/webp');
    expect(sniffImage(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull();
  });
  it('يرفض الصور التالفة أو المبتورة حتى لو كانت ترويستها صحيحة', () => {
    // الحالة التي كانت تُقبل: 12 بايت بترويسة PNG فقط
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]))).toBeNull();
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBeNull();
    expect(sniffImage(PNG_1X1.slice(0, PNG_1X1.length - 12))).toBeNull(); // رفع انقطع قبل IEND
    expect(sniffImage(JPEG_1X1.slice(0, JPEG_1X1.length - 2))).toBeNull(); // بلا علامة النهاية
    expect(sniffImage(WEBP_1X1.slice(0, WEBP_1X1.length - 2))).toBeNull(); // حجم RIFF لا يطابق الملف
    expect(sniffImage(withPngSize(0, 1))).toBeNull(); // عرض صفر
    expect(sniffImage(withPngSize(100_000, 100_000))).toBeNull(); // أبعاد مبالغ فيها (قنبلة فك ضغط عند من يعرضها)
  });
});
