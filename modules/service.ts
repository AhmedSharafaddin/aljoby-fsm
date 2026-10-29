// الشكاوى، تقييم العملاء، الفرق والمستخدمين، ومزامنة الفروع من موقع الشركة.
import type { ComplaintStatus } from '@prisma/client';
import { z } from 'zod';
import type { Actor } from '@/lib/auth';
import { hashPassword, sha256 } from '@/lib/auth';
import { AppError, audit, conflict, db, forbidden, normalizePhone, notFound } from '@/lib/core';
import { assertCan, complaintScope, MANAGERS, orderScope } from '@/lib/permissions';
import { complaintMoveAllowed, ROLE_FOR_SERVICE } from './rules';

const id = z.uuid();

// ---------- الشكاوى ----------

export async function listComplaints(actor: Actor, status?: string) {
  assertCan(actor, 'dashboard.view');
  return db.complaint.findMany({
    where: { AND: [complaintScope(actor), status ? { status: status as ComplaintStatus } : {}] },
    include: { order: { select: { number: true, invoiceNumber: true, serviceType: true } }, customer: true, branch: true },
    orderBy: { openedAt: 'desc' },
    take: 200,
  });
}

export async function createComplaint(actor: Actor, raw: unknown) {
  assertCan(actor, 'complaint.create');
  const input = z.object({ orderId: id, description: z.string().trim().min(5, 'صف الشكوى').max(2000) }).parse(raw);
  const order = await db.serviceOrder.findFirst({ where: { AND: [{ id: input.orderId }, orderScope(actor)] } });
  if (!order) throw notFound();
  return db.$transaction(async (tx) => {
    const c = await tx.complaint.create({
      data: { orderId: order.id, customerId: order.customerId, branchId: order.branchId, description: input.description },
    });
    await audit(tx, actor.id, 'complaint', c.id, 'create');
    return c;
  });
}

export async function updateComplaint(actor: Actor, complaintId: string, raw: unknown) {
  assertCan(actor, 'complaint.manage');
  const input = z
    .object({
      status: z.enum(['NEW', 'IN_PROGRESS', 'CONTACTED', 'RESOLVED', 'CLOSED']).optional(),
      assignedToId: id.optional(),
      reason: z.string().trim().max(500).optional(),
    })
    .parse(raw);
  return db.$transaction(async (tx) => {
    const c = await tx.complaint.findUnique({ where: { id: id.parse(complaintId) } });
    if (!c) throw notFound();
    const data: Record<string, unknown> = {};
    if (input.assignedToId) {
      const u = await tx.user.findFirst({ where: { id: input.assignedToId, isActive: true, role: { in: [...MANAGERS, 'SUPERVISOR'] } } });
      if (!u) throw new AppError(422, 'المسؤول غير صالح');
      data.assignedToId = u.id;
    }
    if (input.status && input.status !== c.status) {
      if (!complaintMoveAllowed(c.status, input.status, actor.role === 'ADMIN', input.reason)) {
        throw conflict('لا يجوز الرجوع بحالة الشكوى إلا للمدير العام مع ذكر السبب');
      }
      data.status = input.status;
      const now = new Date();
      if (input.status === 'RESOLVED' || input.status === 'CLOSED') data.resolvedAt = c.resolvedAt ?? now;
      if (input.status === 'CLOSED') data.closedAt = now;
      if (['NEW', 'IN_PROGRESS', 'CONTACTED'].includes(input.status)) Object.assign(data, { resolvedAt: null, closedAt: null });
    }
    const r = await tx.complaint.updateMany({ where: { id: c.id, status: c.status }, data });
    if (r.count !== 1) throw conflict('تغيّرت الشكوى للتو، حدّث الصفحة');
    await audit(tx, actor.id, 'complaint', c.id, 'update', { from: c.status, ...input });
  });
}

// ---------- تقييم العميل (رابط عام مقيّد) ----------

export async function reviewTarget(token: string) {
  const order = await db.serviceOrder.findUnique({
    where: { reviewTokenHash: sha256(token) },
    select: { id: true, number: true, serviceType: true, reviewTokenExpires: true, review: { select: { id: true } } },
  });
  if (!order || !order.reviewTokenExpires || order.reviewTokenExpires < new Date()) return null;
  return { ...order, done: !!order.review }; // done: يُعرض شكر بدل النموذج
}

export async function submitReview(token: string, raw: unknown) {
  const score = z.coerce.number().int().min(1).max(5);
  const input = z.object({ stars: score, punctuality: score, serviceQuality: score, notes: z.string().trim().max(1000).optional() }).parse(raw);
  const order = await reviewTarget(token);
  if (!order) throw new AppError(404, 'الرابط غير صالح أو انتهت صلاحيته');
  if (order.done) throw conflict('تم استلام تقييمك مسبقًا');
  try {
    // orderId فريد في الجدول: حتى طلبان متزامنان لا ينتجان تقييمين
    await db.customerReview.create({ data: { orderId: order.id, ...input } });
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') throw conflict('تم استلام تقييمك مسبقًا');
    throw e;
  }
}

// ---------- المستخدمون والفرق ----------

const userSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(6).max(20),
  password: z.string().min(8, 'كلمة المرور 8 أحرف على الأقل').max(200),
  role: z.enum(['ADMIN', 'SERVICE_MANAGER', 'SUPERVISOR', 'BRANCH', 'INSTALLER', 'CARPET_LAYER', 'DRIVER']),
  branchId: id.optional(),
});

export async function createUser(actor: Actor, raw: unknown) {
  assertCan(actor, 'user.manage');
  const input = userSchema.parse(raw);
  if (MANAGERS.includes(input.role) && actor.role !== 'ADMIN') throw forbidden();
  if (input.role === 'BRANCH' && !input.branchId) throw new AppError(422, 'حساب الفرع يحتاج تحديد الفرع');
  const phone = normalizePhone(input.phone);
  if (await db.user.findUnique({ where: { phone } })) throw conflict('رقم الهاتف مستخدم');
  const user = await db.user.create({
    data: { name: input.name, phone, role: input.role, branchId: input.role === 'BRANCH' ? input.branchId : null, passwordHash: await hashPassword(input.password) },
    select: { id: true },
  });
  await audit(db, actor.id, 'user', user.id, 'create', { role: input.role });
  return user;
}

export async function updateUser(actor: Actor, userId: string, raw: unknown) {
  assertCan(actor, 'user.manage');
  const input = z.object({ isActive: z.boolean().optional(), password: z.string().min(8).max(200).optional() }).parse(raw);
  const target = await db.user.findUnique({ where: { id: id.parse(userId) } });
  if (!target) throw notFound();
  if (MANAGERS.includes(target.role) && actor.role !== 'ADMIN') throw forbidden();
  if (target.id === actor.id && input.isActive === false) throw conflict('لا يمكنك إيقاف حسابك');
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: target.id },
      data: { isActive: input.isActive, passwordHash: input.password ? await hashPassword(input.password) : undefined },
    });
    // إيقاف الحساب أو تغيير كلمة المرور ينهي جلساته
    if (input.isActive === false || input.password) await tx.session.deleteMany({ where: { userId: target.id } });
    await audit(tx, actor.id, 'user', target.id, 'update', { isActive: input.isActive, passwordChanged: !!input.password });
  });
}

export async function createTeam(actor: Actor, raw: unknown) {
  assertCan(actor, 'team.manage');
  const input = z
    .object({
      name: z.string().trim().min(2).max(100),
      type: z.enum(['FURNITURE', 'CARPET', 'DELIVERY']),
      zone: z.string().trim().max(100).default(''),
      capacity: z.coerce.number().int().min(1).max(20).default(1),
      supervisorId: id.optional(),
    })
    .parse(raw);
  if (input.supervisorId && !(await db.user.findFirst({ where: { id: input.supervisorId, role: 'SUPERVISOR', isActive: true } }))) {
    throw new AppError(422, 'المشرف غير صالح');
  }
  const team = await db.team.create({ data: input });
  await audit(db, actor.id, 'team', team.id, 'create');
  return team;
}

export async function setTeamMember(actor: Actor, teamId: string, raw: unknown) {
  assertCan(actor, 'team.manage');
  const input = z.object({ userId: id, remove: z.boolean().default(false) }).parse(raw);
  const team = await db.team.findUnique({ where: { id: id.parse(teamId) } });
  if (!team) throw notFound();
  if (input.remove) {
    await db.teamMember.deleteMany({ where: { teamId: team.id, userId: input.userId } });
  } else {
    const u = await db.user.findFirst({ where: { id: input.userId, isActive: true, role: ROLE_FOR_SERVICE[team.type] } });
    if (!u) throw new AppError(422, 'الموظف لا يناسب نوع الفريق');
    await db.teamMember.upsert({ where: { teamId_userId: { teamId: team.id, userId: u.id } }, create: { teamId: team.id, userId: u.id }, update: {} });
  }
  await audit(db, actor.id, 'team', team.id, input.remove ? 'removeMember' : 'addMember', { userId: input.userId });
}

// ---------- الفروع: مصدرها موقع الجوبي (aj-platform) ----------

const wpBranches = z.object({
  items: z.array(z.object({ id: z.number().int(), name: z.string(), city: z.string().default(''), address: z.string().default('') })),
});

/** يقرأ /wp-json/aj/v1/branches ويحدّث الجدول المحلي. الفرع المحذوف من الموقع يُوقف هنا ولا يُحذف. */
export async function syncBranches(actorId: string | null) {
  const base = process.env.WP_BASE_URL || 'https://aljobyfurniture.com';
  const res = await fetch(`${base}/wp-json/aj/v1/branches`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new AppError(409, `تعذّر قراءة الفروع من الموقع (${res.status})`);
  const { items } = wpBranches.parse(await res.json());
  if (items.length === 0) throw conflict('الموقع لم يُرجع أي فرع — لم يُغيَّر شيء');
  await db.$transaction(async (tx) => {
    for (const b of items) {
      await tx.branch.upsert({
        where: { wpId: b.id },
        create: { wpId: b.id, name: b.name, city: b.city, address: b.address },
        update: { name: b.name, city: b.city, address: b.address, isActive: true },
      });
    }
    await tx.branch.updateMany({ where: { wpId: { notIn: items.map((b) => b.id) } }, data: { isActive: false } });
    await audit(tx, actorId, 'branch', 'all', 'sync', { count: items.length });
  });
  return { count: items.length };
}
