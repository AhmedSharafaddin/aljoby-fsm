// بيانات تطوير فقط. لا طلبات وهمية — التقارير تبقى صفرًا حتى يُدخل طلب حقيقي.
// الحسابات هنا معروفة للمطورين، لذلك يرفض السكربت العمل في الإنتاج.
import { hashPassword } from '@/lib/auth';
import { db } from '@/lib/core';
import { syncBranches } from '@/modules/service';

if (process.env.NODE_ENV === 'production') {
  console.error('seed مخصّص للتطوير فقط — أوقف التنفيذ.');
  process.exit(1);
}

const DEV_PASSWORD = 'dev-password-123';

async function main() {
  // الفروع: من موقع الجوبي إن أمكن، وإلا فرعان تجريبيان موسومان (wpId = null)
  let branches = await db.branch.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  if (branches.length === 0) {
    try {
      const r = await syncBranches(null);
      console.log(`فروع من الموقع: ${r.count}`);
    } catch (e) {
      console.warn(`تعذّرت مزامنة الفروع (${(e as Error).message}) — سيُنشأ فرعان تجريبيان.`);
      await db.branch.createMany({ data: [{ name: 'فرع تجريبي ١', city: 'صنعاء' }, { name: 'فرع تجريبي ٢', city: 'عدن' }] });
    }
    branches = await db.branch.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  }

  const passwordHash = await hashPassword(DEV_PASSWORD);
  const users = [
    ['المدير العام', '967700000001', 'ADMIN'],
    ['مدير الخدمات', '967700000002', 'SERVICE_MANAGER'],
    ['المشرف', '967700000003', 'SUPERVISOR'],
    ['موظف الفرع الأول', '967700000004', 'BRANCH', branches[0].id],
    ['موظف الفرع الثاني', '967700000005', 'BRANCH', branches[1]?.id ?? branches[0].id],
    ['معلم أثاث ١', '967700000006', 'INSTALLER'],
    ['معلم أثاث ٢', '967700000007', 'INSTALLER'],
    ['مفروش موكيت', '967700000008', 'CARPET_LAYER'],
    ['سائق', '967700000009', 'DRIVER'],
  ] as const;
  const ids: Record<string, string> = {};
  for (const [name, phone, role, branchId] of users) {
    const u = await db.user.upsert({ where: { phone }, update: {}, create: { name, phone, role, branchId, passwordHash } });
    ids[phone] = u.id;
  }

  if ((await db.team.count()) === 0) {
    const sup = ids['967700000003'];
    await db.team.create({ data: { name: 'فريق أثاث ١', type: 'FURNITURE', capacity: 1, supervisorId: sup, members: { create: [{ userId: ids['967700000006'] }, { userId: ids['967700000007'] }] } } });
    await db.team.create({ data: { name: 'فريق موكيت ١', type: 'CARPET', capacity: 1, supervisorId: sup, members: { create: [{ userId: ids['967700000008'] }] } } });
    await db.team.create({ data: { name: 'شاحنة ١', type: 'DELIVERY', capacity: 1, supervisorId: sup, members: { create: [{ userId: ids['967700000009'] }] } } });
  }

  console.log(`حسابات التطوير: 967700000001…009 — كلمة المرور في prisma/seed.ts (DEV_PASSWORD).`);
}

main().finally(() => db.$disconnect());
