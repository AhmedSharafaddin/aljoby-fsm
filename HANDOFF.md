# Handoff — نظام الخدمات الميدانية للجوبي (aljoby-fsm)

**المسار:** `C:\Users\asharaf\Documents\aljoby-services\aljoby-fsm`. فيه git محلي بلا remote، وآخر commit هو `7e27a5e` والشجرة نظيفة. git بلا هوية، لذلك يُمرَّر `-c user.name="ammaraljoby" -c user.email="ammaraljoby@gmail.com"`.
**المواصفة الأصلية:** `C:\Users\asharaf\Downloads\Claude_نظام_إدارة_الخدمات_الميدانية.md`. المبدأ: «بسيط وقابل للتوسع».
**تفاصيل ما نُفِّذ:** `IMPLEMENTATION_STATUS.md`.

## قيود المستخدم
- لا تغيّر أشياء لم يطلبها.
- لا تخلط مع «تطبيق المهام». نفّذ ما يخص هذا التطبيق فقط.
- اتبع البوابات في `~/.claude/CLAUDE.md`:
  - TDD: اختبار يفشل أولًا.
  - فحص الواجهة على 375 و768 و1440.
  - إعدادات fail-closed.
  - دليل حي من الأوامر قبل قول «تم».

## التقنية
- Next.js 16.4 (App Router، بلا middleware)، وPrisma 6.19 مع PostgreSQL، وzod 4، وTailwind 4، وargon2.
- الجلسات مخزنة في القاعدة (كوكي `fsm_session`)، والحماية من CSRF بفحص Origin، وحد المحاولات في ذاكرة العملية.
- الطبقات:
  - `app/` (مسارات وصفحات رقيقة) ← `modules/` (orders, tasks, service, reports, rules) ← `lib/` (core, auth, permissions, api, storage).
  - صفحات الخادم تستدعي `modules/` مباشرة.
  - صفحات العميل تستدعي `/api/v1` ثم `router.refresh()`.
- النطاقات where-clauses (`orderScope` وأخواتها)، وما خارج النطاق يعطي 404. التزامن بـ `updateMany where status` و`FOR UPDATE`. الوقت يُخزَّن UTC، والمنطقة الزمنية `Asia/Aden`.

## التشغيل
- قاعدة التطوير: `npm run db:local` (PGlite على المنفذ 5432).
- قاعدة الاختبار: `npm run db:local -- test` (المنفذ 5433).
- الفحص الكامل: `npm run verify` (typecheck + lint + test + build). آخر نتيجة: 68/68، وكلها نظيفة.
- الخادم: إعداد `fsm` في `..\.claude\launch.json` (المنفذ 3000).
- حسابات التطوير: من 967700000001 إلى 967700000009، وكلمة المرور في `prisma/seed.ts`.
- إيقاف كل شيء:
  ```powershell
  Get-NetTCPConnection -State Listen -LocalPort 5432,5433,3000 | Stop-Process
  ```
- npm 11 يمنع install scripts. الحل: `npm rebuild` ثم `npx prisma generate`.

## الحالة (2026-11-04)
الكود جاهز، والمتبقي كله تشغيل وإطلاق: **انظر docs/LAUNCH_CHECKLIST.md** (قائمة Go/No-Go بمالك ومعيار قبول لكل بند). أول خطوة: تأكد أن CI أخضر على GitHub (يشغّل الفحص الكامل على PostgreSQL 17 حقيقي لأول مرة).

أُنجز: البرومبتان 4 و5 كاملين، ونطاق الميدان، وصور الأدلة (تصغير وفحص اكتمال)، واسم العميل لا يُستبدل، ولا ملفات يتيمة، وفحص الإعدادات عند الإقلاع، وHSTS.

## مؤجّل عمدًا بشرط لإعادة النظر (التفاصيل في LAUNCH_CHECKLIST.md البند 4)
- مخزن مشترك لحد المحاولات وS3: عند أكثر من خادم.
- تخزين مؤقت وإعادة كتابة البحث: عند تجاوز الزمن ثانية في الإنتاج.
- عمود BigInt للتكاليف: عند تكلفة تتجاوز 21,474,836.47 في سجل واحد.

## قاعدة العمل
أي مهمة جديدة: اختبار يفشل أولًا (TDD)، ثم `npm run verify`، ثم commit ورفع إلى origin/main.
