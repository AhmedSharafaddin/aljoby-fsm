// لوحة المؤشرات والتقارير — كلها محسوبة من البيانات المخزنة، بلا أرقام ثابتة.
import type { Role } from '@prisma/client';
import { z } from 'zod';
import type { Actor } from '@/lib/auth';
import { AppError, audit, dayRange, db, localDate } from '@/lib/core';
import { assertCan, complaintScope, MANAGERS, orderScope } from '@/lib/permissions';
import { ACTIVE_ASSIGNMENT, isLate, OPEN_ORDER } from './rules';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : null);

export type TeamState = 'AVAILABLE' | 'BUSY' | 'LATE' | 'ISSUE';

export async function dashboardSummary(actor: Actor, rawDate?: string) {
  assertCan(actor, 'dashboard.view');
  const day = date.catch(localDate()).parse(rawDate ?? localDate());
  const range = dayRange(day);
  const scope = orderScope(actor);
  const now = new Date();
  const and = (w: object) => ({ AND: [scope, w] });

  const [today, completed, inProgress, lateOpen, complaintsOpen, complaintsToday, reviews, resolved] = await Promise.all([
    db.serviceOrder.count({ where: and({ OR: [{ scheduledStart: range }, { scheduledStart: null, requestedDate: range }] }) }),
    db.serviceOrder.count({ where: and({ completedAt: range }) }),
    db.serviceOrder.count({ where: and({ status: 'IN_PROGRESS' }) }),
    db.serviceOrder.count({ where: and({ status: { in: OPEN_ORDER.filter((s) => s !== 'ON_HOLD') }, scheduledEnd: { lt: now } }) }),
    db.complaint.count({ where: { AND: [complaintScope(actor), { status: { notIn: ['RESOLVED', 'CLOSED'] } }] } }),
    db.complaint.count({ where: { AND: [complaintScope(actor), { openedAt: range }] } }),
    db.customerReview.findMany({ where: { order: scope, submittedAt: { gte: new Date(now.getTime() - 30 * 86400_000) } }, select: { stars: true, serviceQuality: true } }),
    db.complaint.findMany({ where: { AND: [complaintScope(actor), { resolvedAt: { not: null } }] }, select: { openedAt: true, resolvedAt: true }, take: 500, orderBy: { resolvedAt: 'desc' } }),
  ]);

  // الالتزام بالموعد: من الطلبات المكتملة آخر 30 يومًا
  const recent = await db.serviceOrder.findMany({
    where: and({ status: 'COMPLETED', completedAt: { gte: new Date(now.getTime() - 30 * 86400_000) }, scheduledEnd: { not: null } }),
    select: { status: true, scheduledEnd: true, completedAt: true },
  });

  return {
    date: day,
    today, completed, inProgress, late: lateOpen, complaintsOpen, complaintsToday,
    onTimeRate: pct(recent.filter((o) => !isLate(o)).length, recent.length),
    avgStars: avg(reviews.map((r) => r.stars)),
    avgQuality: avg(reviews.map((r) => r.serviceQuality)),
    reviewsCount: reviews.length,
    avgResolutionHours: avg(resolved.map((c) => (c.resolvedAt!.getTime() - c.openedAt.getTime()) / 3600_000)),
    teams: MANAGERS.includes(actor.role) || actor.role === 'SUPERVISOR' ? await teamStates(actor) : [],
  };
}

/** حالة كل فريق الآن: مشكلة > متأخر > في مهمة > متاح. */
export async function teamStates(actor: Actor) {
  const now = new Date();
  const teams = await db.team.findMany({
    where: { isActive: true, ...(actor.role === 'SUPERVISOR' ? { supervisorId: actor.id } : {}) },
    include: {
      members: { include: { user: { select: { name: true } } } },
      assignments: { where: { status: { in: [...ACTIVE_ASSIGNMENT] } }, select: { status: true, scheduledStart: true, scheduledEnd: true } },
    },
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  });
  return teams.map((t) => {
    const a = t.assignments;
    const state: TeamState = a.some((x) => x.status === 'ISSUE')
      ? 'ISSUE'
      : a.some((x) => x.scheduledEnd < now)
        ? 'LATE'
        : a.some((x) => x.status === 'IN_PROGRESS' || (x.scheduledStart <= now && x.scheduledEnd > now))
          ? 'BUSY'
          : 'AVAILABLE';
    return { id: t.id, name: t.name, type: t.type, zone: t.zone, capacity: t.capacity, members: t.members.map((m) => m.user.name), open: a.length, state };
  });
}

// ---------- التقارير ----------

export const rangeSchema = z.object({ from: date.optional(), to: date.optional() });
function period(raw: unknown) {
  const r = rangeSchema.parse(raw);
  const to = r.to ?? localDate();
  const from = r.from ?? localDate(new Date(Date.now() - 29 * 86400_000));
  return { from, to, gte: dayRange(from).gte, lt: dayRange(to).lt };
}

/** تقرير الطلبات: كل طلب أُنشئ أو جُدول ضمن الفترة. */
export async function ordersReport(actor: Actor, raw: unknown) {
  assertCan(actor, 'report.view');
  const p = period(raw);
  const span = { gte: p.gte, lt: p.lt };
  const rows = await db.serviceOrder.findMany({
    where: { OR: [{ createdAt: span }, { scheduledStart: span }] },
    include: { branch: true, customer: true, _count: { select: { complaints: true } } },
    orderBy: { createdAt: 'asc' },
    take: 5000, // ponytail: سقف للتصدير؛ أضف ترقيمًا عندما تتجاوز الفترة هذا الحجم
  });
  const items = rows.map((o) => ({
    number: o.number, branch: o.branch.name, invoice: o.invoiceNumber, customer: o.customer.name, type: o.serviceType,
    status: o.status, scheduledStart: o.scheduledStart, completedAt: o.completedAt, late: isLate(o), complaints: o._count.complaints,
  }));
  const totals = {
    orders: items.length,
    completed: items.filter((i) => i.status === 'COMPLETED').length,
    late: items.filter((i) => i.late).length,
    cancelled: items.filter((i) => i.status === 'CANCELLED').length,
    complaints: items.reduce((s, i) => s + i.complaints, 0),
  };
  const byBranch = Object.values(
    items.reduce<Record<string, { branch: string; orders: number; completed: number; late: number; cancelled: number }>>((acc, i) => {
      const b = (acc[i.branch] ??= { branch: i.branch, orders: 0, completed: 0, late: 0, cancelled: 0 });
      b.orders++;
      if (i.status === 'COMPLETED') b.completed++;
      if (i.status === 'CANCELLED') b.cancelled++;
      if (i.late) b.late++;
      return acc;
    }, {}),
  );
  return { from: p.from, to: p.to, items, totals, byBranch };
}

/**
 * أداء الموظفين حسب الوظيفة. المهمة المسندة لفريق تُحسب لكل أعضائه.
 * ponytail: عضوية الفريق الحالية هي المرجع (لا تاريخ عضوية)؛ أضف joinedAt/leftAt للحساب عند كثرة التنقل بين الفرق.
 */
export async function employeesReport(actor: Actor, raw: unknown) {
  assertCan(actor, 'report.view');
  const p = period(raw);
  const users = await db.user.findMany({
    where: { role: { in: ['INSTALLER', 'CARPET_LAYER', 'DRIVER'] } },
    select: { id: true, name: true, role: true, isActive: true, memberships: { select: { teamId: true } } },
    orderBy: { name: 'asc' },
  });
  // المجاميع تُحسب في القاعدة لكل (فريق، موظف): عشرات الصفوف بدل كل المهام بعلاقاتها (سنة على 50 ألف طلب: 3.4 ثانية ← 0.19)
  const groups = await db.$queryRaw<EmployeeGroup[]>`
    SELECT a."teamId", a."assigneeId", count(*)::int tasks,
      coalesce(sum(extract(epoch FROM a."completedAt" - a."startedAt") / 60) FILTER (WHERE a."startedAt" IS NOT NULL), 0)::float minutes,
      count(*) FILTER (WHERE a."startedAt" IS NOT NULL)::int timed,
      count(*) FILTER (WHERE a."completedAt" <= a."scheduledEnd")::int "onTime",
      coalesce(sum(r.stars), 0)::int stars, count(r.stars)::int rated,
      coalesce(sum(cc.n), 0)::int complaints, coalesce(sum(o."itemsCount"), 0)::int pieces,
      coalesce(sum(cw."areaSqm"), 0)::float area,
      coalesce(sum(coalesce(cw."quantityReceived", 0) - coalesce(cw."quantityUsed", 0)), 0)::float waste,
      coalesce(sum(f.minor), 0)::float "fuelMinor"
    FROM "TaskAssignment" a
    JOIN "ServiceOrder" o ON o.id = a."orderId"
    LEFT JOIN "CustomerReview" r ON r."orderId" = o.id
    LEFT JOIN "CarpetWorkOrder" cw ON cw."orderId" = o.id
    LEFT JOIN (SELECT "orderId", count(*) n FROM "Complaint" GROUP BY 1) cc ON cc."orderId" = o.id
    LEFT JOIN (SELECT "orderId", sum("amountMinor") minor FROM "WorkCost" WHERE category = 'FUEL' GROUP BY 1) f ON f."orderId" = o.id
    WHERE a.status = 'COMPLETED' AND a."completedAt" >= ${p.gte} AND a."completedAt" < ${p.lt}
    GROUP BY 1, 2`;
  return {
    from: p.from, to: p.to,
    items: users.map((u) => {
      const teams = new Set(u.memberships.map((m) => m.teamId));
      const mine = groups.filter((g) => g.assigneeId === u.id || (g.teamId && teams.has(g.teamId)));
      const total = (k: Exclude<keyof EmployeeGroup, 'teamId' | 'assigneeId'>) => mine.reduce((s, g) => s + g[k], 0);
      const ratio = (n: number, d: number) => (d ? Math.round((n / d) * 10) / 10 : null);
      const round2 = (n: number) => Math.round(n * 100) / 100;
      const tasks = total('tasks');
      const base = {
        id: u.id, name: u.name, role: u.role as Role, isActive: u.isActive,
        tasks,
        hours: Math.round((total('minutes') / 60) * 10) / 10,
        avgMinutes: ratio(total('minutes'), total('timed')),
        onTimeRate: pct(total('onTime'), tasks),
        avgStars: ratio(total('stars'), total('rated')),
        complaints: total('complaints'),
      };
      const extra =
        u.role === 'INSTALLER'
          ? { pieces: total('pieces') }
          : u.role === 'CARPET_LAYER'
            ? { areaSqm: round2(total('area')), wasteSqm: round2(total('waste')) }
            : { trips: tasks, fuel: total('fuelMinor') / 100 };
      return { ...base, ...extra };
    }),
  };
}

type EmployeeGroup = {
  teamId: string | null; assigneeId: string | null;
  tasks: number; minutes: number; timed: number; onTime: number; stars: number; rated: number;
  complaints: number; pieces: number; area: number; waste: number; fuelMinor: number;
};

// ---------- التكاليف ----------

export const CURRENCY = process.env.COST_CURRENCY || 'ر.ي';
export const money = (minor: number) => `${(minor / 100).toLocaleString('ar', { maximumFractionDigits: 2 })} ${CURRENCY}`;

const costSchema = z.object({
  category: z.enum(['FUEL', 'MAINTENANCE', 'OVERTIME', 'OTHER']),
  // المبلغ بالوحدة الكبرى كنص ("1500.50") ← يُخزَّن صحيحًا بالوحدات الصغرى، بلا float في التخزين
  amount: z.string().trim().regex(/^\d{1,9}(\.\d{1,2})?$/, 'مبلغ غير صالح'),
  date,
  orderNumber: z.coerce.number().int().positive().optional(),
  note: z.string().trim().max(500).optional(),
});

export async function createCost(actor: Actor, raw: unknown) {
  assertCan(actor, 'cost.manage');
  const input = costSchema.parse(raw);
  const [major, frac = ''] = input.amount.split('.');
  const amountMinor = Number(major) * 100 + Number(frac.padEnd(2, '0'));
  if (amountMinor <= 0) throw new AppError(422, 'المبلغ يجب أن يكون أكبر من صفر');
  if (amountMinor > 2_147_483_647) throw new AppError(422, 'المبلغ كبير جدًا (الحد الأقصى 21474836.47)'); // عمود amountMinor من نوع Int 32 بت
  let orderId: string | undefined;
  if (input.orderNumber) {
    const o = await db.serviceOrder.findUnique({ where: { number: input.orderNumber }, select: { id: true } });
    if (!o) throw new AppError(422, 'رقم الطلب غير موجود');
    orderId = o.id;
  }
  const cost = await db.workCost.create({
    data: { category: input.category, amountMinor, orderId, note: input.note, occurredAt: dayRange(input.date).gte, createdById: actor.id },
  });
  await audit(db, actor.id, 'cost', cost.id, 'create', { amountMinor, category: input.category });
  return cost;
}

/** تقرير التكاليف: المجموع حسب الفئة، وتكلفة كل طلب (رحلة/خدمة) خلال الفترة. */
export async function costsReport(actor: Actor, raw: unknown) {
  assertCan(actor, 'report.view');
  const p = period(raw);
  const rows = await db.workCost.findMany({
    where: { occurredAt: { gte: p.gte, lt: p.lt } },
    include: { order: { select: { number: true, serviceType: true } } },
    orderBy: { occurredAt: 'asc' },
  });
  const byCategory = { FUEL: 0, MAINTENANCE: 0, OVERTIME: 0, OTHER: 0 };
  const byOrder = new Map<number, { order: number; type: string; totalMinor: number }>();
  for (const r of rows) {
    byCategory[r.category] += r.amountMinor;
    if (r.order) {
      const e = byOrder.get(r.order.number) ?? { order: r.order.number, type: r.order.serviceType, totalMinor: 0 };
      e.totalMinor += r.amountMinor;
      byOrder.set(r.order.number, e);
    }
  }
  return {
    from: p.from, to: p.to, currency: CURRENCY,
    totalMinor: rows.reduce((s, r) => s + r.amountMinor, 0),
    byCategory,
    byOrder: [...byOrder.values()],
    items: rows.map((r) => ({ date: r.occurredAt, category: r.category, amount: r.amountMinor / 100, order: r.order?.number ?? '', note: r.note ?? '' })),
  };
}

/** CSV بترميز UTF-8 مع BOM كي يفتحه Excel بالعربية صحيحًا. */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '﻿';
  const cols = [...new Set(rows.flatMap(Object.keys))]; // الأدوار المختلفة لها أعمدة مختلفة
  const cell = (v: unknown) => {
    let s = v instanceof Date ? v.toISOString() : v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // منع حقن الصيغ في Excel (OWASP CSV injection)
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n');
}
