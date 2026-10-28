# خدمات الجوبي الميدانية

نظام إدارة التركيب وفرش الموكيت والتوصيل لشركة الجوبي: الفروع تُدخل الطلب المرتبط بالفاتورة،
الإدارة تعتمد وتجدول وتُسند، والفرق الميدانية تنفّذ من الهاتف بالصور والتوقيع، والنتائج تظهر في
لوحة المؤشرات والتقارير. **بسيط وقابل للتوسع.**

- [المعمارية وقاعدة البيانات والصلاحيات](docs/ARCHITECTURE.md)
- [واجهة API](docs/API.md)
- [الافتراضات وما أُعيد استخدامه من منظومة الجوبي](docs/ASSUMPTIONS.md)
- [النشر والنسخ الاحتياطي](docs/DEPLOYMENT.md)
- [حالة التنفيذ](IMPLEMENTATION_STATUS.md)

## التشغيل محليًا

المتطلبات: Node 22+ وPostgreSQL (عبر Docker أو بدونه).

```bash
npm install
npm install-scripts approve @prisma/client @prisma/engines prisma esbuild   # npm 11 يحجب سكربتات التثبيت افتراضيًا
cp .env.example .env
docker compose up -d        # أو بلا Docker: npm run db:local (نافذة مستقلة) واستخدم روابط PGlite المعلّقة في .env
npx prisma migrate deploy
npm run db:seed             # فروع من موقع الجوبي + حسابات تطوير
npm run dev                 # http://localhost:3000
```

حسابات التطوير: الأرقام `967700000001` (مدير عام) حتى `967700000009` (سائق) — الأدوار وكلمة المرور في `prisma/seed.ts`.
لا تُستخدم في الإنتاج.

## الفحص

```bash
npm run verify    # typecheck + الاختبارات (تحتاج TEST_DATABASE_URL) + build
```

## التقنيات

Next.js 16 (App Router) · TypeScript · PostgreSQL + Prisma 6 · Tailwind 4 · zod 4 · Argon2id · Vitest.
