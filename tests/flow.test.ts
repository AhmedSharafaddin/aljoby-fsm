// اختبار تكامل على قاعدة حقيقية: من إنشاء الطلب في الفرع حتى الإتمام والتقييم والشكوى،
// مع حالات 401/403/404/409/422 وعزل البيانات بين الفروع والفرق.
import type { Role } from '@prisma/client';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { GET as listOrdersRoute, POST as createOrderRoute } from '@/app/api/v1/orders/route';
import { POST as loginRoute } from '@/app/api/v1/auth/login/route';
import { GET as teamsRoute } from '@/app/api/v1/teams/route';
import { createSession, hashPassword, login, type Actor } from '@/lib/auth';
import { AppError, db, localDate, nullIfNotFound, parseLocal, toLocalInput } from '@/lib/core';
import { approveOrder, assignmentCandidates, assignOrder, createOrder, createReviewLink, getOrder, listOrders, reassign, setOrderState } from '@/modules/orders';
import { costsReport, createCost, dashboardSummary, employeesReport } from '@/modules/reports';
import { createComplaint, createUser, listComplaints, reviewTarget, setTeamMember, submitReview, syncBranches, updateComplaint, updateUser } from '@/modules/service';
import { advanceTrip, completeTask, getTask, listMyTasks, readFileFor, reportIssue, shareLocation, startTask, updateCarpet, uploadFile } from '@/modules/tasks';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const photo = (kind: string, signerName?: string) => {
  const fd = new FormData();
  fd.set('kind', kind);
  fd.set('file', new File([PNG], 'p.png', { type: 'image/png' }));
  if (signerName) fd.set('signerName', signerName);
  return fd;
};

/** يتوقع خطأ أعمال بحالة HTTP معيّنة. */
async function status(p: Promise<unknown>): Promise<number> {
  try {
    await p;
    return 200;
  } catch (e) {
    if (e instanceof AppError) return e.status;
    if ((e as { name?: string }).name === 'ZodError') return 422;
    throw e;
  }
}

let A: Record<string, Actor>;
let branchA: string, branchB: string, teamF: string, teamF2: string, teamC: string;
const slot = (hFrom: number, hTo: number) => {
  const d = new Date(Date.now() + 2 * 86400_000);
  d.setUTCHours(0, 0, 0, 0);
  return { start: toLocalInput(new Date(d.getTime() + hFrom * 3600_000)), end: toLocalInput(new Date(d.getTime() + hTo * 3600_000)) };
};
const orderInput = (o: Record<string, unknown> = {}) => ({
  invoiceNumber: 'INV-1001', customerName: 'عميل الاختبار', customerPhone: '0771234567', serviceType: 'FURNITURE',
  requestedDate: localDate(), address: 'صنعاء — شارع حدة', itemsCount: 7, ...o,
});

beforeAll(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE "LocationPing","WorkCost","AuditLog","CustomerReview","Complaint","TaskEvent","TaskFile","TaskAssignment","DeliveryTrip","CarpetWorkOrder","ServiceOrder","Customer","TeamMember","Team","Session","User","Branch" CASCADE',
  );
  branchA = (await db.branch.create({ data: { name: 'فرع أ' } })).id;
  branchB = (await db.branch.create({ data: { name: 'فرع ب' } })).id;
  const passwordHash = await hashPassword('test-password');
  const mk = async (key: string, role: Role, branchId: string | null = null) => {
    const u = await db.user.create({ data: { name: key, phone: `9677${String(Object.keys(A).length).padStart(8, '0')}`, role, branchId, passwordHash } });
    A[key] = { id: u.id, name: key, role, branchId };
  };
  A = {};
  await mk('admin', 'ADMIN');
  await mk('manager', 'SERVICE_MANAGER');
  await mk('sup', 'SUPERVISOR');
  await mk('sup2', 'SUPERVISOR');
  await mk('branchA', 'BRANCH', branchA);
  await mk('branchB', 'BRANCH', branchB);
  await mk('inst1', 'INSTALLER');
  await mk('inst2', 'INSTALLER');
  await mk('carpet', 'CARPET_LAYER');
  await mk('driver', 'DRIVER');
  teamF = (await db.team.create({ data: { name: 'أثاث ١', type: 'FURNITURE', supervisorId: A.sup.id, members: { create: { userId: A.inst1.id } } } })).id;
  teamF2 = (await db.team.create({ data: { name: 'أثاث ٢', type: 'FURNITURE', supervisorId: A.sup2.id, members: { create: { userId: A.inst2.id } } } })).id;
  teamC = (await db.team.create({ data: { name: 'موكيت', type: 'CARPET', supervisorId: A.sup.id, members: { create: { userId: A.carpet.id } } } })).id;
});

describe('التدفق الكامل لطلب تركيب أثاث', () => {
  let orderId: string, taskId: string;

  it('الفرع ينشئ طلبًا مربوطًا بالفاتورة، والفني لا يستطيع', async () => {
    const o = await createOrder(A.branchA, orderInput({ branchId: branchB, priority: 'HIGH' }));
    orderId = o.id;
    expect(o.branchId).toBe(branchA); // الفرع يُؤخذ من الحساب لا من المدخلات
    expect(o.status).toBe('NEW');
    expect(await status(createOrder(A.inst1, orderInput()))).toBe(403);
    expect(await status(createOrder(A.branchA, orderInput({ invoiceNumber: '' })))).toBe(422);
  });

  it('الطلب يظهر للإدارة ولا يظهر للفرع الآخر حتى بالمعرّف المباشر', async () => {
    expect((await listOrders(A.manager, {})).items.some((o) => o.id === orderId)).toBe(true);
    expect((await listOrders(A.branchB, {})).items.some((o) => o.id === orderId)).toBe(false);
    expect(await status(getOrder(A.branchB, orderId))).toBe(404);
  });

  it('لا إسناد قبل الاعتماد، والفرع لا يعتمد', async () => {
    expect(await status(assignOrder(A.manager, orderId, { teamId: teamF, ...slot(9, 12) }))).toBe(409);
    expect(await status(assignOrder(A.sup, orderId, { teamId: teamF, ...slot(9, 12) }))).toBe(404); // الجديد خارج نطاق المشرف
    expect(await status(approveOrder(A.branchA, orderId))).toBe(403);
    await approveOrder(A.manager, orderId);
    expect(await status(approveOrder(A.manager, orderId))).toBe(409);
  });

  it('المشرف يسند لفريقه فقط، والخادم يمنع التضارب الزمني', async () => {
    expect(await status(assignOrder(A.sup, orderId, { teamId: teamF2, ...slot(9, 12) }))).toBe(403);
    expect(await status(assignOrder(A.sup, orderId, { teamId: teamC, ...slot(9, 12) }))).toBe(422); // نوع خاطئ
    const a = await assignOrder(A.sup, orderId, { teamId: teamF, ...slot(9, 12) });
    taskId = a.id;

    const other = await createOrder(A.branchA, orderInput({ invoiceNumber: 'INV-2' }));
    await approveOrder(A.manager, other.id);
    expect(await status(assignOrder(A.manager, other.id, { teamId: teamF, ...slot(11, 13) }))).toBe(409);
    expect(await status(assignOrder(A.manager, other.id, { teamId: teamF, ...slot(12, 14) }))).toBe(200); // يبدأ عند انتهاء الأول
  });

  it('الموظف المسند يرى المهمة، وزميل فريق آخر لا يراها', async () => {
    expect((await listMyTasks(A.inst1)).some((t) => t.id === taskId)).toBe(true);
    expect((await listMyTasks(A.inst2)).some((t) => t.id === taskId)).toBe(false);
    expect(await status(getTask(A.inst2, taskId))).toBe(404);
    expect(await status(startTask(A.inst2, taskId))).toBe(404);
  });

  it('لا رفع قبل البدء، ولا إتمام بلا أدلة، ثم الإتمام بعد الصور والتوقيع', async () => {
    expect(await status(uploadFile(A.inst1, taskId, photo('BEFORE')))).toBe(409);
    await startTask(A.inst1, taskId);
    await startTask(A.inst1, taskId); // إعادة إرسال — بلا خطأ
    expect(await status(completeTask(A.inst1, taskId))).toBe(422);

    const bad = new FormData();
    bad.set('kind', 'AFTER');
    bad.set('file', new File(['<svg/>'], 'x.png', { type: 'image/png' }));
    expect(await status(uploadFile(A.inst1, taskId, bad))).toBe(415);
    expect(await status(uploadFile(A.inst1, taskId, photo('SIGNATURE')))).toBe(422); // بلا اسم المستلم

    await uploadFile(A.inst1, taskId, photo('BEFORE'));
    await uploadFile(A.inst1, taskId, photo('AFTER'));
    await uploadFile(A.inst1, taskId, photo('SIGNATURE', 'المستلم'));
    await completeTask(A.inst1, taskId);
    await completeTask(A.inst1, taskId); // مكرر بعد ضعف الاتصال — نفس النتيجة

    const o = await getOrder(A.branchA, orderId);
    expect(o.status).toBe('COMPLETED');
    expect(o.completedAt).not.toBeNull();
    expect(o.assignments[0].events.map((e) => e.type)).toEqual(['ASSIGNED', 'STARTED', 'PHOTO', 'PHOTO', 'SIGNATURE', 'COMPLETED']);
  });

  it('الإتمام ينعكس على لوحة الإدارة وتقرير الأداء', async () => {
    const s = await dashboardSummary(A.manager);
    expect(s.completed).toBeGreaterThanOrEqual(1);
    const rows = (await employeesReport(A.manager, {})).items;
    const inst1 = rows.find((r) => r.id === A.inst1.id)!;
    expect(inst1.tasks).toBe(1);
    expect('pieces' in inst1 && inst1.pieces).toBe(7);
    expect(rows.find((r) => r.id === A.inst2.id)!.tasks).toBe(0);
  });

  it('العميل يقيّم مرة واحدة فقط عبر رابط صالح', async () => {
    expect(await status(createReviewLink(A.branchB, orderId, 'http://x'))).toBe(404);
    const { url, whatsapp } = await createReviewLink(A.branchA, orderId, 'http://x');
    expect(whatsapp).toContain('wa.me/967771234567');
    const token = url.split('/r/')[1];
    expect(await status(submitReview('wrong-token', { stars: 5, punctuality: 5, serviceQuality: 5 }))).toBe(404);
    await submitReview(token, { stars: 4, punctuality: 5, serviceQuality: 4, notes: 'ممتاز' });
    expect(await status(submitReview(token, { stars: 1, punctuality: 1, serviceQuality: 1 }))).toBe(409);
    expect(await status(createReviewLink(A.branchA, orderId, 'http://x'))).toBe(409);
    expect((await dashboardSummary(A.manager)).avgStars).toBe(4);
  });

  it('الشكوى: رقم تذكرة، مسؤول، حالات للأمام، وزمن حل', async () => {
    const c = await createComplaint(A.branchA, { orderId, description: 'خدش في الطاولة بعد التركيب' });
    expect(c.ticketNumber).toBeGreaterThan(0);
    expect(c.branchId).toBe(branchA);
    expect(await status(createComplaint(A.branchB, { orderId, description: 'محاولة من فرع آخر' }))).toBe(404);
    expect(await status(updateComplaint(A.branchA, c.id, { status: 'CLOSED' }))).toBe(403);
    await updateComplaint(A.manager, c.id, { status: 'IN_PROGRESS', assignedToId: A.sup.id });
    await updateComplaint(A.manager, c.id, { status: 'RESOLVED' });
    expect(await status(updateComplaint(A.manager, c.id, { status: 'IN_PROGRESS' }))).toBe(409);
    expect((await listComplaints(A.branchB)).length).toBe(0);
    expect((await dashboardSummary(A.manager)).avgResolutionHours).not.toBeNull();
  });
});

describe('إعادة الإسناد تحفظ التاريخ', () => {
  it('يُغلق التكليف القديم ويُنشأ جديد', async () => {
    const o = await createOrder(A.manager, orderInput({ branchId: branchA, invoiceNumber: 'INV-R' }));
    await approveOrder(A.manager, o.id);
    const first = await assignOrder(A.manager, o.id, { teamId: teamF2, ...slot(15, 16) });
    await reportIssue(A.inst2, first.id, { note: 'العميل غير موجود' });
    expect((await getOrder(A.manager, o.id)).status).toBe('ISSUE_REPORTED');
    await reassign(A.manager, first.id, { teamId: teamF, ...slot(17, 18) });
    const after = await getOrder(A.manager, o.id);
    expect(after.status).toBe('SCHEDULED');
    expect(after.assignments.map((a) => a.status)).toEqual(['REASSIGNED', 'ASSIGNED']);
    expect(await status(startTask(A.inst2, first.id))).toBe(409); // التكليف القديم مغلق
  });
});

describe('رحلة التوصيل', () => {
  it('خطوة بخطوة، والتسليم يحتاج التوقيع ثم يُتم الطلب', async () => {
    const o = await createOrder(A.branchA, orderInput({ serviceType: 'DELIVERY', invoiceNumber: 'INV-D' }));
    await approveOrder(A.manager, o.id);
    expect(await status(assignOrder(A.manager, o.id, { assigneeId: A.inst1.id, ...slot(9, 10) }))).toBe(422); // ليس سائقًا
    const t = await assignOrder(A.manager, o.id, { assigneeId: A.driver.id, ...slot(9, 10) });
    expect(await status(startTask(A.driver, t.id))).toBe(409); // التوصيل يبدأ بالتحميل
    expect(await status(advanceTrip(A.driver, t.id, { to: 'ARRIVED' }))).toBe(409); // قفز
    await advanceTrip(A.driver, t.id, { to: 'LOADED' });
    await advanceTrip(A.driver, t.id, { to: 'DEPARTED' });
    await advanceTrip(A.driver, t.id, { to: 'ARRIVED' });
    expect(await status(advanceTrip(A.driver, t.id, { to: 'DELIVERED' }))).toBe(422);
    await uploadFile(A.driver, t.id, photo('SIGNATURE', 'مستلم البضاعة'));
    await advanceTrip(A.driver, t.id, { to: 'DELIVERED' });
    const done = await getOrder(A.manager, o.id);
    expect(done.status).toBe('COMPLETED');
    expect(done.trip?.deliveredAt).not.toBeNull();
  });
});

describe('أمر فرش الموكيت', () => {
  it('يسجل الكميات ويرفض استخدامًا أكبر من المستلم', async () => {
    expect(await status(createOrder(A.branchA, orderInput({ serviceType: 'CARPET' })))).toBe(422); // بلا مساحة
    const o = await createOrder(A.branchA, orderInput({ serviceType: 'CARPET', carpetType: 'موكيت تركي', areaSqm: 48, invoiceNumber: 'INV-C' }));
    await approveOrder(A.manager, o.id);
    const t = await assignOrder(A.sup, o.id, { teamId: teamC, ...slot(9, 13) });
    await startTask(A.carpet, t.id);
    expect(await status(updateCarpet(A.carpet, t.id, { quantityReceived: 50, quantityUsed: 51 }))).toBe(422);
    await updateCarpet(A.carpet, t.id, { workersCount: 3, quantityReceived: 52, quantityUsed: 48.5 });
    for (const k of ['BEFORE', 'AFTER']) await uploadFile(A.carpet, t.id, photo(k));
    await uploadFile(A.carpet, t.id, photo('SIGNATURE', 'العميل'));
    await completeTask(A.carpet, t.id);
    const row = (await employeesReport(A.manager, {})).items.find((r) => r.id === A.carpet.id)!;
    expect('wasteSqm' in row && row.wasteSqm).toBe(3.5);
    expect('areaSqm' in row && row.areaSqm).toBe(48);
  });
});

describe('اقتراح الفريق عند الإسناد', () => {
  it('يرتب الفرق ويعلّم المحجوز في الموعد', async () => {
    const zoneTeam = await db.team.create({ data: { name: 'أثاث حدة', type: 'FURNITURE', zone: 'حدة', supervisorId: A.sup.id } });
    const s = slot(12, 13); // فريق «أثاث ١» محجوز 12–14 من اختبار سابق
    const { teams } = await assignmentCandidates(A.manager, { serviceType: 'FURNITURE', address: 'صنعاء — شارع حدة' }, parseLocal(s.start), parseLocal(s.end));
    expect(teams[0].id).toBe(zoneTeam.id);
    expect(teams.find((t) => t.id === teamF)!.blocked).toBe(true);
    expect(teams.every((t) => t.id !== teamC)).toBe(true); // نوع آخر لا يُعرض
    const forSup2 = await assignmentCandidates(A.sup2, { serviceType: 'FURNITURE', address: '' }, parseLocal(s.start), parseLocal(s.end));
    expect(forSup2.teams.map((t) => t.id)).toEqual([teamF2]); // نطاق المشرف فقط
  });
});

describe('التكاليف', () => {
  it('تُخزَّن بوحدات صغرى صحيحة وتظهر في التقرير وفي وقود السائق', async () => {
    const delivered = await db.serviceOrder.findFirstOrThrow({ where: { invoiceNumber: 'INV-D' } });
    expect(await status(createCost(A.branchA, { category: 'FUEL', amount: '10', date: localDate() }))).toBe(403);
    expect(await status(createCost(A.manager, { category: 'FUEL', amount: '-5', date: localDate() }))).toBe(422);
    expect(await status(createCost(A.manager, { category: 'FUEL', amount: '1.234', date: localDate() }))).toBe(422);
    expect(await status(createCost(A.manager, { category: 'FUEL', amount: '5', date: localDate(), orderNumber: 999999 }))).toBe(422);
    const c = await createCost(A.manager, { category: 'FUEL', amount: '2500.50', date: localDate(), orderNumber: delivered.number });
    expect(c.amountMinor).toBe(250050);
    await createCost(A.manager, { category: 'OVERTIME', amount: '0.1', date: localDate() });
    const r = await costsReport(A.manager, {});
    expect(r.byCategory.FUEL).toBe(250050);
    expect(r.byCategory.OVERTIME).toBe(10);
    expect(r.totalMinor).toBe(250060);
    expect(r.byOrder).toEqual([{ order: delivered.number, type: 'DELIVERY', totalMinor: 250050 }]);
    const driver = (await employeesReport(A.manager, {})).items.find((u) => u.id === A.driver.id)!;
    expect('fuel' in driver && driver.fuel).toBe(2500.5);
  });
});

describe('مشاركة الموقع', () => {
  it('أثناء مهمة قيد التنفيذ للمسند له فقط', async () => {
    const o = await createOrder(A.manager, orderInput({ branchId: branchA, invoiceNumber: 'INV-L' }));
    await approveOrder(A.manager, o.id);
    const t = await assignOrder(A.manager, o.id, { teamId: teamF2, ...slot(20, 21) });
    const at = { assignmentId: t.id, lat: 15.35, lng: 44.2 };
    expect(await status(shareLocation(A.inst2, at))).toBe(409); // قبل البدء
    await startTask(A.inst2, t.id);
    expect(await status(shareLocation(A.inst1, at))).toBe(404); // ليس من فريقه
    expect(await status(shareLocation(A.manager, at))).toBe(403);
    expect(await status(shareLocation(A.inst2, { ...at, lat: 120 }))).toBe(422);
    await shareLocation(A.inst2, at);
    expect((await getOrder(A.manager, o.id)).assignments[0].pings[0].lat).toBe(15.35);
    await reportIssue(A.inst2, t.id, { note: 'توقف' });
    expect(await status(shareLocation(A.inst2, at))).toBe(409); // بعد خروج المهمة من التنفيذ
  });
});

describe('طبقة HTTP', () => {
  it('401 بلا جلسة', async () => {
    const res = await listOrdersRoute(new Request('http://localhost/api/v1/orders'), { params: Promise.resolve({}) });
    expect(res.status).toBe(401);
  });
  it('403 لطلب تعديل من موقع آخر (CSRF)', async () => {
    const { token } = await createSession(A.branchA.id);
    const res = await createOrderRoute(
      new Request('http://localhost/api/v1/orders', {
        method: 'POST',
        headers: { cookie: `fsm_session=${token}`, origin: 'https://evil.example', host: 'localhost', 'content-type': 'application/json' },
        body: JSON.stringify(orderInput()),
      }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(403);
  });
  it('200 مع جلسة صالحة ونفس المصدر، و422 برسالة عربية', async () => {
    const { token } = await createSession(A.branchA.id);
    const req = (b: unknown) =>
      new Request('http://localhost/api/v1/orders', {
        method: 'POST',
        headers: { cookie: `fsm_session=${token}`, origin: 'http://localhost', host: 'localhost', 'content-type': 'application/json' },
        body: JSON.stringify(b),
      });
    expect((await createOrderRoute(req(orderInput({ invoiceNumber: 'INV-HTTP' })), { params: Promise.resolve({}) })).status).toBe(200);
    const bad = await createOrderRoute(req({ ...orderInput(), serviceType: 'CARPET' }), { params: Promise.resolve({}) });
    expect(bad.status).toBe(422);
    expect((await bad.json()).error).toContain('الموكيت');
  });
});

// ---------- بوابات الجودة: إعادة إنتاج الثغرات أولًا، ثم تغطية المنطق غير المختبر ----------

const json = (url: string, init: RequestInit & { token?: string } = {}) =>
  new Request(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      host: 'localhost',
      ...(init.token ? { cookie: `fsm_session=${init.token}` } : {}),
      ...((init.headers as Record<string, string>) ?? {}),
    },
  });
const noParams = { params: Promise.resolve({}) };

describe('ثغرات أُصلحت', () => {
  it('حد محاولات الدخول لكل رقم لا يُتجاوز بتغيير X-Forwarded-For', async () => {
    const phone = '967700000005'; // branchB
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await loginRoute(
        json('http://localhost/api/v1/auth/login', {
          method: 'POST',
          headers: { 'x-forwarded-for': `10.0.0.${i}` },
          body: JSON.stringify({ phone, password: 'wrong' }),
        }),
      );
      codes.push(res.status);
    }
    expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true);
    expect(codes[10]).toBe(429);
  });

  it('رابط التقييم يرفض العمل في الإنتاج بلا APP_URL بدل الاعتماد على عنوان الطلب', async () => {
    const env = process.env as Record<string, string | undefined>;
    const [node, appUrl] = [env.NODE_ENV, env.APP_URL];
    env.NODE_ENV = 'production';
    delete env.APP_URL;
    try {
      await expect(createReviewLink(A.manager, '00000000-0000-0000-0000-000000000000', 'http://evil.example')).rejects.toThrow('APP_URL');
    } finally {
      env.NODE_ENV = node;
      if (appUrl !== undefined) env.APP_URL = appUrl;
    }
  });

  it('حساب الفرع لا يقرأ حالة الفرق وأعضاءها', async () => {
    const { token } = await createSession(A.branchA.id);
    expect((await teamsRoute(json('http://localhost/api/v1/teams', { token }), noParams)).status).toBe(403);
    const mgr = await createSession(A.manager.id);
    expect((await teamsRoute(json('http://localhost/api/v1/teams', { token: mgr.token }), noParams)).status).toBe(200);
  });

  it('Origin: null يُرفض بـ 403 لا 500', async () => {
    const { token } = await createSession(A.branchA.id);
    const res = await createOrderRoute(
      json('http://localhost/api/v1/orders', { method: 'POST', token, headers: { origin: 'null' }, body: '{}' }),
      noParams,
    );
    expect(res.status).toBe(403);
  });

  it('الجلسات المنتهية تُحذف عند الدخول', async () => {
    const old = await db.session.create({ data: { tokenHash: 'expired-test', userId: A.inst1.id, expiresAt: new Date(Date.now() - 1000) } });
    await login('967700000006', 'test-password'); // inst1
    expect(await db.session.findUnique({ where: { id: old.id } })).toBeNull();
  });
});

describe('تغطية منطق كان بلا اختبار', () => {
  it('الإيقاف والاستئناف والإلغاء: سبب إلزامي، ممنوع أثناء التنفيذ، والتكليف يُغلق', async () => {
    const o = await createOrder(A.manager, orderInput({ branchId: branchA, invoiceNumber: 'INV-H' }));
    await approveOrder(A.manager, o.id);
    const a = await assignOrder(A.manager, o.id, { teamId: teamF2, ...slot(6, 7) });
    expect(await status(setOrderState(A.manager, o.id, 'ON_HOLD', {}))).toBe(422);
    expect(await status(setOrderState(A.branchA, o.id, 'ON_HOLD', { reason: 'سبب' }))).toBe(403);
    await setOrderState(A.manager, o.id, 'ON_HOLD', { reason: 'العميل مسافر' });
    let got = await getOrder(A.manager, o.id);
    expect(got.status).toBe('ON_HOLD');
    expect(got.assignments[0].status).toBe('CANCELLED');
    await setOrderState(A.manager, o.id, 'APPROVED', { reason: 'عاد العميل' });
    got = await getOrder(A.manager, o.id);
    expect([got.status, got.scheduledStart]).toEqual(['APPROVED', null]);
    const b = await assignOrder(A.manager, o.id, { teamId: teamF2, ...slot(6, 7) }); // الموعد تحرر
    await startTask(A.inst2, b.id);
    expect(await status(setOrderState(A.manager, o.id, 'CANCELLED', { reason: 'إلغاء' }))).toBe(409);
    expect(a.id).not.toBe(b.id);
  });

  it('المستخدمون: مدير الخدمات لا ينشئ مديرًا، والإيقاف ينهي الجلسات فورًا', async () => {
    const base = { name: 'موظف جديد', password: 'password-123' };
    expect(await status(createUser(A.manager, { ...base, phone: '0711000001', role: 'ADMIN' }))).toBe(403);
    expect(await status(createUser(A.branchA, { ...base, phone: '0711000001', role: 'INSTALLER' }))).toBe(403);
    expect(await status(createUser(A.manager, { ...base, phone: '0711000001', role: 'BRANCH' }))).toBe(422); // بلا فرع
    const u = await createUser(A.manager, { ...base, phone: '0711000001', role: 'INSTALLER' });
    expect(await status(createUser(A.manager, { ...base, phone: '+967 711 000 001', role: 'DRIVER' }))).toBe(409); // نفس الرقم بصيغة أخرى
    const { token } = await createSession(u.id);
    await updateUser(A.manager, u.id, { isActive: false });
    expect(await db.session.count({ where: { userId: u.id } })).toBe(0);
    expect((await listOrdersRoute(json('http://localhost/api/v1/orders', { token }), noParams)).status).toBe(401);
    expect(await status(updateUser(A.manager, A.admin.id, { isActive: false }))).toBe(403);
    expect(await status(updateUser(A.admin, A.admin.id, { isActive: false }))).toBe(409);
  });

  it('عضوية الفريق تقبل الدور المناسب فقط', async () => {
    expect(await status(setTeamMember(A.manager, teamC, { userId: A.inst1.id }))).toBe(422);
    expect(await status(setTeamMember(A.sup, teamC, { userId: A.carpet.id }))).toBe(403);
    await setTeamMember(A.manager, teamF, { userId: A.inst2.id });
    await setTeamMember(A.manager, teamF, { userId: A.inst2.id }); // مكرر بلا خطأ
    expect(await db.teamMember.count({ where: { teamId: teamF, userId: A.inst2.id } })).toBe(1);
    await setTeamMember(A.manager, teamF, { userId: A.inst2.id, remove: true });
    expect(await db.teamMember.count({ where: { teamId: teamF, userId: A.inst2.id } })).toBe(0);
  });

  it('مزامنة الفروع: تحدّث وتوقف المحذوف، والرد الفارغ لا يغيّر شيئًا', async () => {
    const reply = (items: unknown[]) => vi.fn(async () => Response.json({ items }));
    vi.stubGlobal('fetch', reply([{ id: 9001, name: 'فرع م١', city: 'صنعاء', address: 'أ' }, { id: 9002, name: 'فرع م٢' }]));
    try {
      await syncBranches(A.admin.id);
      vi.stubGlobal('fetch', reply([{ id: 9001, name: 'فرع م١ (معدل)' }]));
      await syncBranches(A.admin.id);
      const [b1, b2] = await Promise.all([db.branch.findUnique({ where: { wpId: 9001 } }), db.branch.findUnique({ where: { wpId: 9002 } })]);
      expect([b1?.name, b1?.isActive, b2?.isActive]).toEqual(['فرع م١ (معدل)', true, false]);
      vi.stubGlobal('fetch', reply([]));
      expect(await status(syncBranches(A.admin.id))).toBe(409);
      expect((await db.branch.findUnique({ where: { wpId: 9001 } }))?.isActive).toBe(true);
      expect((await db.branch.findUnique({ where: { id: branchA } }))?.isActive).toBe(true); // فروع بلا wpId لا تُمس
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('الملفات: لا تُقرأ من فرع آخر ولا من فريق آخر حتى بالمعرّف المباشر', async () => {
    const file = await db.taskFile.findFirstOrThrow({ where: { assignment: { order: { invoiceNumber: 'INV-1001' } } } });
    expect((await readFileFor(A.branchA, file.id)).mime).toBe('image/png');
    expect((await readFileFor(A.inst1, file.id)).mime).toBe('image/png');
    expect(await status(readFileFor(A.branchB, file.id))).toBe(404);
    expect(await status(readFileFor(A.carpet, file.id))).toBe(404);
    expect(await status(readFileFor(A.sup2, file.id))).toBe(404);
  });

  it('رابط التقييم المنتهي لا يُقبل', async () => {
    const o = await db.serviceOrder.findFirstOrThrow({ where: { invoiceNumber: 'INV-C' } });
    const { url } = await createReviewLink(A.manager, o.id, 'http://x');
    const token = url.split('/r/')[1];
    await db.serviceOrder.update({ where: { id: o.id }, data: { reviewTokenExpires: new Date(Date.now() - 1000) } });
    expect(await reviewTarget(token)).toBeNull();
    expect(await status(submitReview(token, { stars: 5, punctuality: 5, serviceQuality: 5 }))).toBe(404);
  });

  it('لوحة الفرع تعدّ طلبات فرعه فقط', async () => {
    const all = await db.serviceOrder.count({ where: { completedAt: { not: null } } });
    const mine = await db.serviceOrder.count({ where: { completedAt: { not: null }, branchId: branchB } });
    expect(all).toBeGreaterThan(mine);
    expect((await dashboardSummary(A.branchB)).completed).toBe(mine);
    expect((await dashboardSummary(A.branchB)).teams).toEqual([]);
  });
});

describe('لوحة المؤشرات: المعلّق ليس متأخرًا', () => {
  it('طلب معلّق تجاوز موعده لا يدخل في «متأخرة الآن»', async () => {
    const before = (await dashboardSummary(A.manager)).late;
    const o = await createOrder(A.manager, orderInput({ branchId: branchA, invoiceNumber: 'INV-LATE-HOLD' }));
    const past = new Date(Date.now() - 86400_000);
    await db.serviceOrder.update({ where: { id: o.id }, data: { status: 'ON_HOLD', scheduledStart: past, scheduledEnd: past } });
    expect((await dashboardSummary(A.manager)).late).toBe(before);
    await db.serviceOrder.update({ where: { id: o.id }, data: { status: 'SCHEDULED' } });
    expect((await dashboardSummary(A.manager)).late).toBe(before + 1); // نفس الطلب مجدولًا يُعد متأخرًا
  });
});

describe('المؤجَّل المنفَّذ', () => {
  it('فهرسا createdAt (قائمة الطلبات) وcompletedAt (لوحة المؤشرات) موجودان', async () => {
    const rows = await db.$queryRaw<{ indexname: string }[]>`SELECT indexname FROM pg_indexes WHERE tablename = 'ServiceOrder'`;
    const names = rows.map((r) => r.indexname);
    expect(names).toContain('ServiceOrder_createdAt_idx');
    expect(names).toContain('ServiceOrder_completedAt_idx');
  });

  it('الصفحات: «غير موجود» (404 أو معرّف مشوّه) يصير null، وأي خطأ آخر يُرفع ولا يُبتلع', async () => {
    expect(nullIfNotFound(new AppError(404, 'x'))).toBeNull();
    const bad = await getOrder(A.manager, 'not-a-uuid').catch(nullIfNotFound);
    expect(bad).toBeNull();
    expect(() => nullIfNotFound(new AppError(409, 'قاعدة البيانات متوقفة'))).toThrow('قاعدة البيانات متوقفة');
    expect(() => nullIfNotFound(new Error('connection refused'))).toThrow('connection refused');
  });
});
