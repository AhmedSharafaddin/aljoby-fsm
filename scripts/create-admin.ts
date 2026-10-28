// إنشاء أول مدير عام في الإنتاج: ADMIN_PHONE=967… ADMIN_PASSWORD=… npx tsx scripts/create-admin.ts
import { hashPassword } from '@/lib/auth';
import { db, normalizePhone } from '@/lib/core';

const phone = normalizePhone(process.env.ADMIN_PHONE ?? '');
const password = process.env.ADMIN_PASSWORD ?? '';
if (!phone || password.length < 12) {
  console.error('ADMIN_PHONE و ADMIN_PASSWORD (12 حرفًا على الأقل) مطلوبان.');
  process.exit(1);
}
await db.user.create({ data: { name: process.env.ADMIN_NAME || 'المدير العام', phone, role: 'ADMIN', passwordHash: await hashPassword(password) } });
console.log('أُنشئ حساب المدير العام.');
await db.$disconnect();
