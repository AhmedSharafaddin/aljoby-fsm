// طلبات الخدمة: الإنشاء من الفرع، الاعتماد، الجدولة والإسناد، الإيقاف والإلغاء، رابط التقييم.
import type { OrderStatus, Prisma, Role, ServiceType } from '@prisma/client';
import { z } from 'zod';
import type { Actor } from '@/lib/auth';
import { newToken, sha256 } from '@/lib/auth';
import { AppError, audit, conflict, dayRange, db, forbidden, localDate, normalizePhone, notFound, parseLocal, type Tx, waLink } from '@/lib/core';
import { assertCan, orderScope } from '@/lib/permissions';
import { ACTIVE_ASSIGNMENT, canMoveOrder, overlaps, rankCandidates } from './rules';

const id = z.uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'تاريخ غير صالح');

export const createOrderSchema = z
  .object({
    branchId: id.optional(), // للإدارة فقط؛ موظف الفرع يُؤخذ فرعه من حسابه
    invoiceNumber: z.string().trim().min(1).max(50),
    customerName: z.string().trim().min(2).max(100),
    customerPhone: z.string().trim().min(6).max(20),
    serviceType: z.enum(['FURNITURE', 'CARPET', 'DELIVERY']),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
    requestedDate: date,
    address: z.string().trim().min(3).max(300),
    mapUrl: z.url({ protocol: /^https$/ }).max(500).optional(),
    itemsCount: z.coerce.number().int().positive().max(10000).optional(),
    details: z.string().trim().max(2000).default(''),
    carpetType: z.string().trim().max(100).optional(),
    areaSqm: z.coerce.number().positive().max(100000).optional(),
    pickupAddress: z.string().trim().max(300).optional(),
  })
  .refine((v) => v.serviceType !== 'CARPET' || (v.carpetType && v.areaSqm), {
    message: 'أمر الموكيت يحتاج نوع الموكيت والمساحة',
    path: ['areaSqm'],
  });

export async function createOrder(actor: Actor, raw: unknown) {
  assertCan(actor, 'order.create');
  const input = createOrderSchema.parse(raw);
  const branchId = actor.role === 'BRANCH' ? actor.branchId : input.branchId;
  if (!branchId) throw new AppError(422, 'اختر الفرع');
  const branch = await db.branch.findFirst({ where: { id: branchId, isActive: true } });
  if (!branch) throw new AppError(422, 'الفرع غير موجود');
  const phone = normalizePhone(input.customerPhone);

  return db.$transaction(async (tx) => {
    const customer = await tx.customer.upsert({
      where: { phone },
      create: { phone, name: input.customerName },
      update: { name: input.customerName },
    });
    const order = await tx.serviceOrder.create({
      data: {
        branchId, customerId: customer.id, invoiceNumber: input.invoiceNumber, serviceType: input.serviceType,
        priority: input.priority, requestedDate: parseLocal(`${input.requestedDate}T00:00`), address: input.address,
        mapUrl: input.mapUrl, itemsCount: input.itemsCount, details: input.details, createdById: actor.id,
        carpet: input.serviceType === 'CARPET' ? { create: { carpetType: input.carpetType!, areaSqm: input.areaSqm! } } : undefined,
        trip: input.serviceType === 'DELIVERY'
          ? { create: { pickupAddress: input.pickupAddress || branch.address || branch.name } }
          : undefined,
      },
    });
    await audit(tx, actor.id, 'order', order.id, 'create');
    return order;
  });
}

export const listFilters = z.object({
  status: z.enum(['NEW', 'APPROVED', 'SCHEDULED', 'IN_PROGRESS', 'ON_HOLD', 'ISSUE_REPORTED', 'COMPLETED', 'CANCELLED']).optional(),
  serviceType: z.enum(['FURNITURE', 'CARPET', 'DELIVERY']).optional(),
  branchId: id.optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export const PAGE_SIZE = 30;

export async function listOrders(actor: Actor, raw: unknown) {
  const f = listFilters.parse(raw);
  const q = f.q;
  const where: Prisma.ServiceOrderWhereInput = {
    AND: [
      orderScope(actor),
      { status: f.status, serviceType: f.serviceType, branchId: f.branchId },
      q
        ? {
            OR: [
              { invoiceNumber: { contains: q, mode: 'insensitive' } },
              { customer: { name: { contains: q, mode: 'insensitive' } } },
              { customer: { phone: { contains: q.replace(/\D+/g, '') || q } } },
              ...(/^\d+$/.test(q) && Number(q) < 2 ** 31 ? [{ number: Number(q) }] : []),
            ],
          }
        : {},
    ],
  };
  const [items, total] = await Promise.all([
    db.serviceOrder.findMany({
      where,
      include: { branch: true, customer: true },
      orderBy: [{ createdAt: 'desc' }],
      take: PAGE_SIZE,
      skip: (f.page - 1) * PAGE_SIZE,
    }),
    db.serviceOrder.count({ where }),
  ]);
  return { items, total, page: f.page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function getOrder(actor: Actor, orderId: string) {
  const order = await db.serviceOrder.findFirst({
    where: { AND: [{ id: id.parse(orderId) }, orderScope(actor)] },
    include: {
      branch: true, customer: true, trip: true, carpet: true, review: true,
      complaints: { orderBy: { openedAt: 'desc' } },
      assignments: {
        orderBy: { createdAt: 'asc' },
        include: {
          team: true, assignee: { select: { id: true, name: true } }, files: true, events: { orderBy: { at: 'asc' } },
          pings: { orderBy: { capturedAt: 'desc' }, take: 1 },
        },
      },
    },
  });
  if (!order) throw notFound();
  return order;
}

/** يحرّك حالة الطلب مع حماية التزامن: يفشل إن تغيّرت الحالة منذ قراءتها. */
export async function moveOrder(tx: Tx, order: { id: string; status: OrderStatus }, to: OrderStatus, data: Prisma.ServiceOrderUpdateManyMutationInput = {}) {
  if (!canMoveOrder(order.status, to)) throw conflict('لا يمكن تغيير حالة الطلب بهذا الشكل الآن');
  const r = await tx.serviceOrder.updateMany({ where: { id: order.id, status: order.status }, data: { ...data, status: to } });
  if (r.count !== 1) throw conflict('تغيّر الطلب للتو، حدّث الصفحة');
}

async function scopedOrder(tx: Tx, actor: Actor, orderId: string) {
  const order = await tx.serviceOrder.findFirst({ where: { AND: [{ id: id.parse(orderId) }, orderScope(actor)] } });
  if (!order) throw notFound();
  return order;
}

export async function approveOrder(actor: Actor, orderId: string) {
  assertCan(actor, 'order.approve');
  return db.$transaction(async (tx) => {
    const order = await scopedOrder(tx, actor, orderId);
    await moveOrder(tx, order, 'APPROVED');
    await audit(tx, actor.id, 'order', order.id, 'approve');
  });
}

const reasonSchema = z.object({ reason: z.string().trim().min(3, 'اكتب السبب').max(500) });

/** إيقاف أو إلغاء: يُغلق التكليف الفعّال ويُحفظ السبب في السجل. الاستئناف يعيد الطلب للاعتماد ليُجدول من جديد. */
export async function setOrderState(actor: Actor, orderId: string, to: 'ON_HOLD' | 'CANCELLED' | 'APPROVED', raw: unknown) {
  assertCan(actor, 'order.hold');
  const { reason } = reasonSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const order = await scopedOrder(tx, actor, orderId);
    const active = await tx.taskAssignment.findMany({ where: { orderId: order.id, status: { in: [...ACTIVE_ASSIGNMENT] } } });
    if (to !== 'APPROVED' && active.some((a) => a.status === 'IN_PROGRESS')) {
      throw conflict('المهمة قيد التنفيذ الآن؛ يُبلغ الفريق عن مشكلة أولًا');
    }
    await moveOrder(tx, order, to, to === 'APPROVED' ? { scheduledStart: null, scheduledEnd: null } : {});
    for (const a of active) {
      await tx.taskAssignment.update({ where: { id: a.id }, data: { status: 'CANCELLED' } });
      await tx.taskEvent.create({ data: { assignmentId: a.id, type: 'CANCELLED', actorId: actor.id, note: reason } });
    }
    await audit(tx, actor.id, 'order', order.id, to, { reason, from: order.status });
  });
}

// ---------- الإسناد ----------

export const assignSchema = z
  .object({
    teamId: id.optional(),
    assigneeId: id.optional(),
    start: z.string().min(16),
    end: z.string().min(16),
  })
  .refine((v) => !!v.teamId !== !!v.assigneeId, { message: 'اختر فريقًا أو موظفًا واحدًا', path: ['teamId'] });

const ROLE_FOR: Record<ServiceType, Role> = { FURNITURE: 'INSTALLER', CARPET: 'CARPET_LAYER', DELIVERY: 'DRIVER' };

/**
 * يتحقق من الفريق/الموظف ويمنع الحجز المتضارب حسب السعة.
 * يقفل صف الفريق/الموظف داخل المعاملة كي لا يمر إسنادان متزامنان معًا.
 */
async function checkCapacity(
  tx: Tx, actor: Actor, serviceType: ServiceType,
  t: { teamId?: string; assigneeId?: string }, start: Date, end: Date, excludeId?: string,
) {
  if (end <= start) throw new AppError(422, 'نهاية الموعد يجب أن تكون بعد بدايته');
  let capacity = 1;
  if (t.teamId) {
    await tx.$queryRaw`SELECT id FROM "Team" WHERE id = ${t.teamId} FOR UPDATE`;
    const team = await tx.team.findUnique({ where: { id: t.teamId } });
    if (!team || !team.isActive) throw new AppError(422, 'الفريق غير متاح');
    if (team.type !== serviceType) throw new AppError(422, 'نوع الفريق لا يطابق نوع الخدمة');
    if (actor.role === 'SUPERVISOR' && team.supervisorId !== actor.id) throw forbidden();
    capacity = team.capacity;
  } else {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${t.assigneeId} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: t.assigneeId }, include: { memberships: { include: { team: true } } } });
    if (!user || !user.isActive || user.role !== ROLE_FOR[serviceType]) throw new AppError(422, 'الموظف غير مناسب لهذه الخدمة');
    if (actor.role === 'SUPERVISOR' && !user.memberships.some((m) => m.team.supervisorId === actor.id)) throw forbidden();
  }
  // ponytail: يُفحص التضارب للفريق أو للموظف المسند مباشرة كلٌّ على حدة؛ عضو فريق مُسند فرديًا في نفس الوقت لا يُكتشف.
  const busy = await tx.taskAssignment.count({
    where: {
      ...(t.teamId ? { teamId: t.teamId } : { assigneeId: t.assigneeId }),
      status: { in: [...ACTIVE_ASSIGNMENT] },
      scheduledStart: { lt: end },
      scheduledEnd: { gt: start },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  if (busy >= capacity) throw conflict(`يوجد تضارب: ${t.teamId ? 'الفريق' : 'الموظف'} محجوز في هذا الوقت (السعة ${capacity})`);
}

export async function assignOrder(actor: Actor, orderId: string, raw: unknown) {
  assertCan(actor, 'order.assign');
  const input = assignSchema.parse(raw);
  const start = parseLocal(input.start);
  const end = parseLocal(input.end);
  return db.$transaction(async (tx) => {
    const order = await scopedOrder(tx, actor, orderId);
    if (order.status !== 'APPROVED') throw conflict('يُسند الطلب بعد اعتماده فقط');
    await checkCapacity(tx, actor, order.serviceType, input, start, end);
    const a = await tx.taskAssignment.create({
      data: { orderId: order.id, teamId: input.teamId, assigneeId: input.assigneeId, assignedById: actor.id, scheduledStart: start, scheduledEnd: end },
    });
    await tx.taskEvent.create({ data: { assignmentId: a.id, type: 'ASSIGNED', actorId: actor.id } });
    await moveOrder(tx, order, 'SCHEDULED', { scheduledStart: start, scheduledEnd: end });
    await audit(tx, actor.id, 'order', order.id, 'assign', { assignmentId: a.id, ...input });
    return a;
  });
}

/** إعادة الإسناد: يُغلق التكليف القديم (REASSIGNED) ويُنشأ جديد — لا يضيع التاريخ. */
export async function reassign(actor: Actor, assignmentId: string, raw: unknown) {
  assertCan(actor, 'order.assign');
  const input = assignSchema.parse(raw);
  const start = parseLocal(input.start);
  const end = parseLocal(input.end);
  return db.$transaction(async (tx) => {
    const old = await tx.taskAssignment.findFirst({ where: { id: id.parse(assignmentId), order: orderScope(actor) }, include: { order: true } });
    if (!old) throw notFound();
    if (old.status !== 'ASSIGNED' && old.status !== 'ISSUE') throw conflict('لا يُعاد إسناد مهمة بدأت أو انتهت');
    await checkCapacity(tx, actor, old.order.serviceType, input, start, end, old.id);
    const closed = await tx.taskAssignment.updateMany({ where: { id: old.id, status: old.status }, data: { status: 'REASSIGNED' } });
    if (closed.count !== 1) throw conflict('تغيّرت المهمة للتو، حدّث الصفحة');
    await tx.taskEvent.create({ data: { assignmentId: old.id, type: 'REASSIGNED', actorId: actor.id } });
    const a = await tx.taskAssignment.create({
      data: { orderId: old.orderId, teamId: input.teamId, assigneeId: input.assigneeId, assignedById: actor.id, scheduledStart: start, scheduledEnd: end },
    });
    await tx.taskEvent.create({ data: { assignmentId: a.id, type: 'ASSIGNED', actorId: actor.id } });
    await moveOrder(tx, old.order, 'SCHEDULED', { scheduledStart: start, scheduledEnd: end });
    await audit(tx, actor.id, 'order', old.orderId, 'reassign', { from: old.id, to: a.id });
    return a;
  });
}

/**
 * المرشحون للإسناد مرتبين بالاقتراح (rankCandidates) للموعد المقترح:
 * فرق من نفس النوع (ونطاق المشرف)، والسائقون للتوصيل. الخادم يمنع التضارب عند الحفظ مهما اختير.
 */
export async function assignmentCandidates(actor: Actor, order: { serviceType: ServiceType; address: string }, start: Date, end: Date) {
  const supervised = actor.role === 'SUPERVISOR' ? { supervisorId: actor.id } : {};
  const day = dayRange(localDate(start));
  const active = { status: { in: [...ACTIVE_ASSIGNMENT] }, scheduledStart: { lt: day.lt }, scheduledEnd: { gt: day.gte } };
  const usage = (rows: { scheduledStart: Date; scheduledEnd: Date }[]) => ({
    busyAtSlot: rows.filter((a) => overlaps(a.scheduledStart, a.scheduledEnd, start, end)).length,
    loadToday: rows.length,
  });

  const teams = await db.team.findMany({
    where: { type: order.serviceType, isActive: true, ...supervised },
    include: { members: { include: { user: { select: { name: true } } } }, assignments: { where: active, select: { scheduledStart: true, scheduledEnd: true } } },
  });
  const people = order.serviceType === 'DELIVERY'
    ? await db.user.findMany({
        where: { role: 'DRIVER', isActive: true, ...(actor.role === 'SUPERVISOR' ? { memberships: { some: { team: supervised } } } : {}) },
        select: { id: true, name: true, assignments: { where: active, select: { scheduledStart: true, scheduledEnd: true } } },
      })
    : [];
  return {
    teams: rankCandidates(teams.map((t) => ({ ...t, ...usage(t.assignments) })), order.address),
    people: rankCandidates(people.map((p) => ({ id: p.id, name: p.name, zone: '', capacity: 1, ...usage(p.assignments) })), order.address),
  };
}

// ---------- رابط تقييم العميل ----------

export async function createReviewLink(actor: Actor, orderId: string, origin: string) {
  assertCan(actor, 'order.reviewLink');
  // في الإنتاج لا نبني رابطًا يُرسل للعميل من عنوان الطلب (قد يكون داخليًا أو مزوّرًا) — APP_URL إلزامي
  const base = process.env.APP_URL || (process.env.NODE_ENV === 'production' ? '' : origin);
  if (!base) throw new Error('APP_URL غير معرّف في بيئة الإنتاج');
  const order = await db.serviceOrder.findFirst({ where: { AND: [{ id: id.parse(orderId) }, orderScope(actor)] }, include: { customer: true, review: true } });
  if (!order) throw notFound();
  if (order.status !== 'COMPLETED') throw conflict('يُرسل التقييم بعد اكتمال الخدمة');
  if (order.review) throw conflict('قيّم العميل هذا الطلب مسبقًا');
  const token = newToken();
  await db.serviceOrder.update({
    where: { id: order.id },
    data: { reviewTokenHash: sha256(token), reviewTokenExpires: new Date(Date.now() + 7 * 86400_000) },
  });
  const url = `${base}/r/${token}`;
  const text = `مرحبًا ${order.customer.name}، شكرًا لاختياركم الجوبي. نسعد بتقييمكم لخدمة الطلب رقم ${order.number}: ${url}`;
  return { url, whatsapp: waLink(order.customer.phone, text) };
}
