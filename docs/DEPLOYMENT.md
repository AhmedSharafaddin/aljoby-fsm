# النشر الإنتاجي (مسار واحد)

خادم Linux واحد (VPS) + PostgreSQL مُدار أو على نفس الخادم + Nginx أمامه بشهادة HTTPS.

## أول مرة

```bash
# على الخادم: Node 22+ و PostgreSQL 16+
git clone <repo> /srv/aljoby-fsm && cd /srv/aljoby-fsm
cp .env.example .env    # عدّل: DATABASE_URL حقيقي، APP_URL=https://fsm.aljobyfurniture.com، STORAGE_DIR=/var/lib/aljoby-fsm
npm ci
npx prisma migrate deploy
npm run build
NODE_ENV=production npm start   # شغّله عبر systemd أو pm2 على المنفذ 3000
```

**لا تشغّل `npm run db:seed` في الإنتاج** (يرفض العمل عند `NODE_ENV=production`). أنشئ أول مدير عام هكذا مرة واحدة:

```bash
ADMIN_PHONE=967XXXXXXXXX ADMIN_PASSWORD='كلمة-مرور-قوية-12+' npx tsx scripts/create-admin.ts
```

ثم من «المستخدمون والفروع» اضغط **مزامنة من موقع الجوبي**.

## Nginx

```nginx
server {
  server_name fsm.aljobyfurniture.com;
  client_max_body_size 6m;          # الصور حتى 5MB
  location / { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $remote_addr; proxy_set_header X-Forwarded-Host $host; }
}
```

## المهام الدورية والمراقبة

```bash
# crontab — حذف مواقع الفرق الأقدم من LOCATION_RETENTION_DAYS (إلزامي: التطبيق لا يحذفها بنفسه)
15 3 * * * cd /srv/aljoby-fsm && npx tsx scripts/purge-locations.ts >> /var/log/aljoby-fsm-purge.log 2>&1
```

- فحص الصحة: `GET /api/v1/health` يعطي 200 `{"status":"ok"}`، أو 503 إن انقطعت القاعدة. اربطه بأداة المراقبة.
- كل خطأ غير متوقع يُسجَّل سطر JSON واحدًا فيه `requestId`، والرد يحمل نفس القيمة في `x-request-id`. ليمرّر Nginx معرّفه أضف `proxy_set_header X-Request-Id $request_id;`.

## التحديث

```bash
git pull && npm ci && npx prisma migrate deploy && npm run build && systemctl restart aljoby-fsm
```

الترحيلات إضافية فقط (لا حذف أعمدة في نفس الإصدار الذي يتوقف عن استخدامها).

## النسخ الاحتياطي والاستعادة

```bash
# يوميًا عبر cron — القاعدة + مجلد الصور
pg_dump -Fc "$DATABASE_URL" > /backup/fsm-$(date +%F).dump
tar czf /backup/fsm-files-$(date +%F).tgz -C /var/lib/aljoby-fsm .
# الاستعادة
pg_restore --clean --if-exists -d "$DATABASE_URL" /backup/fsm-YYYY-MM-DD.dump
```

احتفظ بالنسخ خارج الخادم. سياسة الاحتفاظ بالصور والتواقيع: تُقرّرها الإدارة (مقترح: 24 شهرًا).
