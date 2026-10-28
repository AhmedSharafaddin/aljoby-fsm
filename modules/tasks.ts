// تطبيق الميدان: مهامي، البدء، المشكلة، الملاحظات، الصور والتوقيع، الإتمام، مراحل الرحلة، أمر الموكيت.
import type { FileKind, Prisma, TripStatus } from '@prisma/client';
import { z } from 'zod';
import type { Actor } from '@/lib/auth';
import { AppError, audit, conflict, db, notFound, type Tx } from '@/lib/core';
import { assertCan, fieldAssignmentScope, orderScope } from '@/lib/permissions';
import { readStored, saveImage } from '@/lib/storage';
import { moveOrder } from './orders';
import { carpetWaste, completionMissing, nextTripStep } from './rules';

const id = z.uuid();

export async function listMyTasks(actor: Actor) {
  assertCan(actor, 'field.work');
  const since = new Date(Date.now() - 7 * 86400_000);
  return db.taskAssignment.findMany({
    where: {
      AND: [
        fieldAssignmentScope(actor),
        { OR: [{ status: { in: ['ASSIGNED', 'IN_PROGRESS', 'ISSUE'] } }, { status: 'COMPLETED', completedAt: { gte: since } }] },
      ],
    },
    include: { order: { include: { customer: true, branch: true, trip: true } } },
    orderBy: { scheduledStart: 'asc' },
  });
}

const taskInclude = {
  order: { include: { customer: true, branch: true, trip: true, carpet: true } },
  files: { orderBy: { createdAt: 'asc' } },
  events: { orderBy: { at: 'asc' } },
  team: true,
} satisfies Prisma.TaskAssignmentInclude;

export async function getTask(actor: Actor, taskId: string) {
  assertCan(actor, 'field.work');
  const t = await db.taskAssignment.findFirst({ where: { AND: [{ id: id.parse(taskId) }, fieldAssignmentScope(actor)] }, include: taskInclude });
  if (!t) throw notFound();
  return t;
}

async function lockedTask(tx: Tx, actor: Actor, taskId: string) {
  assertCan(actor, 'field.work');
  await tx.$queryRaw`SELECT id FROM "TaskAssignment" WHERE id = ${id.parse(taskId)} FOR UPDATE`;
  const t = await tx.taskAssignment.findFirst({ where: { AND: [{ id: taskId }, fieldAssignmentScope(actor)] }, include: taskInclude });
  if (!t) throw notFound();
  return t;
}

const event = (tx: Tx, assignmentId: string, actorId: string, type: string, note?: string) =>
  tx.taskEvent.create({ data: { assignmentId, actorId, type, note } });

export async function startTask(actor: Actor, taskId: string) {
  return db.$transaction(async (tx) => {
    const t = await lockedTask(tx, actor, taskId);
    if (t.status === 'IN_PROGRESS') return; // إعادة إرسال بعد ضعف الاتصال — لا شيء
    if (t.order.serviceType === 'DELIVERY') throw conflict('مهام التوصيل تبدأ بزر «تم التحميل»');
    if (t.status !== 'ASSIGNED' && t.status !== 'ISSUE') throw conflict('لا يمكن بدء هذه المهمة');
    await tx.taskAssignment.update({ where: { id: t.id }, data: { status: 'IN_PROGRESS', startedAt: t.startedAt ?? new Date() } });
    await moveOrder(tx, t.order, 'IN_PROGRESS');
    await event(tx, t.id, actor.id, 'STARTED');
  });
}

const noteSchema = z.object({ note: z.string().trim().min(2, 'اكتب الملاحظة').max(1000) });

export async function reportIssue(actor: Actor, taskId: string, raw: unknown) {
  const { note } = noteSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const t = await lockedTask(tx, actor, taskId);
    if (t.status !== 'ASSIGNED' && t.status !== 'IN_PROGRESS') throw conflict('لا يمكن الإبلاغ على هذه المهمة');
    await tx.taskAssignment.update({ where: { id: t.id }, data: { status: 'ISSUE' } });
    if (t.order.status !== 'ISSUE_REPORTED') await moveOrder(tx, t.order, 'ISSUE_REPORTED');
    await event(tx, t.id, actor.id, 'ISSUE', note);
    await audit(tx, actor.id, 'order', t.orderId, 'issue', { note });
  });
}

export async function addNote(actor: Actor, taskId: string, raw: unknown) {
  const { note } = noteSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const t = await lockedTask(tx, actor, taskId);
    if (!['ASSIGNED', 'IN_PROGRESS', 'ISSUE'].includes(t.status)) throw conflict('المهمة مغلقة');
    await event(tx, t.id, actor.id, 'NOTE', note);
  });
}

const fileKind = z.enum(['BEFORE', 'AFTER', 'DELIVERY', 'SIGNATURE']);

export async function uploadFile(actor: Actor, taskId: string, form: FormData) {
  const kind = fileKind.parse(form.get('kind')) as FileKind;
  const file = form.get('file');
  if (!(file instanceof File)) throw new AppError(422, 'أرفق الصورة');
  const signerName = String(form.get('signerName') ?? '').trim().slice(0, 100) || null;
  if (kind === 'SIGNATURE' && !signerName) throw new AppError(422, 'اكتب اسم المستلم');
  // نتحقق من المهمة قبل كتابة الملف على القرص
  const pre = await getTask(actor, taskId);
  if (pre.status !== 'IN_PROGRESS') throw conflict('ابدأ المهمة أولًا');
  const stored = await saveImage(file);
  return db.$transaction(async (tx) => {
    const t = await lockedTask(tx, actor, taskId);
    if (t.status !== 'IN_PROGRESS') throw conflict('ابدأ المهمة أولًا');
    const f = await tx.taskFile.create({
      data: { assignmentId: t.id, kind, storageKey: stored.key, mime: stored.mime, signerName, uploadedById: actor.id },
    });
    await event(tx, t.id, actor.id, kind === 'SIGNATURE' ? 'SIGNATURE' : 'PHOTO');
    return f;
  });
}

async function finish(tx: Tx, actor: Actor, t: Awaited<ReturnType<typeof lockedTask>>) {
  const missing = completionMissing(t.order.serviceType, t.files, t.order.carpet);
  if (missing.length) throw new AppError(422, `لا يمكن الإتمام، ينقص: ${missing.join('، ')}`);
  const now = new Date();
  await tx.taskAssignment.update({ where: { id: t.id }, data: { status: 'COMPLETED', completedAt: now } });
  await moveOrder(tx, t.order, 'COMPLETED', { completedAt: now });
  await event(tx, t.id, actor.id, 'COMPLETED');
  await audit(tx, actor.id, 'order', t.orderId, 'complete');
}

export async function completeTask(actor: Actor, taskId: string) {
  return db.$transaction(async (tx) => {
    const t = await lockedTask(tx, actor, taskId);
    if (t.status === 'COMPLETED') return; // طلب مكرر — النتيجة نفسها
    if (t.order.serviceType === 'DELIVERY') throw conflict('مهام التوصيل تكتمل بزر «تم التسليم»');
    if (t.status !== 'IN_PROGRESS') throw conflict('ابدأ المهمة أولًا');
    await finish(tx, actor, t);
  });
}

const STAMP: Record<Exclude<TripStatus, 'ASSIGNED'>, 'loadedAt' | 'departedAt' | 'arrivedAt' | 'deliveredAt'> = {
  LOADED: 'loadedAt', DEPARTED: 'departedAt', ARRIVED: 'arrivedAt', DELIVERED: 'deliveredAt',
};

/** تقدّم الرحلة خطوة واحدة. التحميل يبدأ المهمة، والتسليم (بعد التوقيع) يُتمّها. */
export async function advanceTrip(actor: Actor, taskId: string, raw: unknown) {
  const { to } = z.object({ to: z.enum(['LOADED', 'DEPARTED', 'ARRIVED', 'DELIVERED']) }).parse(raw);
  return db.$transaction(async (tx) => {
    const t = await lockedTask(tx, actor, taskId);
    const trip = t.order.trip;
    if (!trip) throw conflict('هذه المهمة ليست رحلة توصيل');
    if (trip.status === to) return; // مكرر
    if (nextTripStep(trip.status) !== to) throw conflict('خطوة الرحلة غير صحيحة');
    if (to === 'LOADED') {
      if (t.status !== 'ASSIGNED' && t.status !== 'ISSUE') throw conflict('لا يمكن بدء هذه الرحلة');
      await tx.taskAssignment.update({ where: { id: t.id }, data: { status: 'IN_PROGRESS', startedAt: t.startedAt ?? new Date() } });
      await moveOrder(tx, t.order, 'IN_PROGRESS');
    } else if (t.status !== 'IN_PROGRESS') {
      throw conflict('الرحلة ليست قيد التنفيذ');
    }
    await tx.deliveryTrip.update({ where: { id: trip.id }, data: { status: to, [STAMP[to]]: new Date() } });
    await event(tx, t.id, actor.id, `TRIP_${to}`);
    if (to === 'DELIVERED') await finish(tx, actor, t);
  });
}

const carpetSchema = z.object({
  workersCount: z.coerce.number().int().min(1).max(50).optional(),
  quantityReceived: z.coerce.number().min(0).max(100000),
  quantityUsed: z.coerce.number().min(0).max(100000),
  qualityNotes: z.string().trim().max(1000).optional(),
});

export async function updateCarpet(actor: Actor, taskId: string, raw: unknown) {
  const input = carpetSchema.parse(raw);
  try {
    carpetWaste(input.quantityReceived, input.quantityUsed);
  } catch (e) {
    throw new AppError(422, (e as Error).message);
  }
  return db.$transaction(async (tx) => {
    const t = await lockedTask(tx, actor, taskId);
    if (!t.order.carpet) throw conflict('هذه المهمة ليست أمر فرش');
    if (t.status !== 'IN_PROGRESS') throw conflict('ابدأ المهمة أولًا');
    await tx.carpetWorkOrder.update({ where: { id: t.order.carpet.id }, data: input });
    await event(tx, t.id, actor.id, 'CARPET');
  });
}

const RETENTION_DAYS = Number(process.env.LOCATION_RETENTION_DAYS || 30);

/**
 * مشاركة الموقع: بضغطة من الموظف نفسه (الموافقة = الضغط + إذن المتصفح)،
 * وفقط أثناء مهمة قيد التنفيذ مسندة له. لا تتبع خلفي ولا خارج المهمة، والقديم يُحذف.
 */
export async function shareLocation(actor: Actor, raw: unknown) {
  assertCan(actor, 'field.work');
  const input = z.object({ assignmentId: id, lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).parse(raw);
  const t = await db.taskAssignment.findFirst({ where: { AND: [{ id: input.assignmentId }, fieldAssignmentScope(actor)] } });
  if (!t) throw notFound();
  if (t.status !== 'IN_PROGRESS') throw conflict('يُشارك الموقع أثناء مهمة قيد التنفيذ فقط');
  await db.locationPing.create({ data: { userId: actor.id, assignmentId: t.id, lat: input.lat, lng: input.lng } });
  await db.locationPing.deleteMany({ where: { capturedAt: { lt: new Date(Date.now() - RETENTION_DAYS * 86400_000) } } });
}

/** تنزيل دليل: يراه من يرى الطلب (الإدارة/الفرع/المشرف) أو الفريق المسند. */
export async function readFileFor(actor: Actor, fileId: string) {
  const f = await db.taskFile.findFirst({
    where: {
      id: id.parse(fileId),
      assignment: { OR: [{ order: orderScope(actor) }, fieldAssignmentScope(actor)] },
    },
  });
  if (!f) throw notFound();
  return { body: await readStored(f.storageKey), mime: f.mime };
}
