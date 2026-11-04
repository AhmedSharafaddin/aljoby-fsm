# النشر الإنتاجي (مسار واحد)

خادم Linux واحد (VPS) + PostgreSQL مُدار أو على نفس الخادم + Nginx أمامه بشهادة HTTPS.

## أول مرة

```bash
# على الخادم: Node 22+ و PostgreSQL 16+، ومستخدم نظام للتطبيق (مثلًا aljoby)
sudo git clone <repo> /srv/aljoby-fsm && sudo chown -R aljoby: /srv/aljoby-fsm && cd /srv/aljoby-fsm

# الأسرار في ملف واحد خارج المستودع، يقرؤه systemd وسكربتات deploy/ (القيم بين علامتي تنصيص)
sudo cp .env.example /etc/aljoby-fsm.env && sudo chmod 600 /etc/aljoby-fsm.env
sudo nano /etc/aljoby-fsm.env   # DATABASE_URL حقيقي، APP_URL="https://fsm.aljobyfurniture.com"، STORAGE_DIR="/var/lib/aljoby-fsm"
sudo mkdir -p /var/lib/aljoby-fsm && sudo chown aljoby: /var/lib/aljoby-fsm

set -a; . /etc/aljoby-fsm.env; set +a   # لأوامر هذه الجلسة فقط
npm ci && npx prisma generate && npx prisma migrate deploy && npm run build

sudo cp deploy/aljoby-fsm.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now aljoby-fsm
curl -fsS http://127.0.0.1:3000/api/v1/health   # {"status":"ok"}
```

**لا تشغّل `npm run db:seed` في الإنتاج** (يرفض العمل عند `NODE_ENV=production`). أنشئ أول مدير عام هكذا مرة واحدة:

```bash
set -a; . /etc/aljoby-fsm.env; set +a   # قاعدة البيانات من ملف الأسرار
ADMIN_PHONE=967XXXXXXXXX ADMIN_PASSWORD='كلمة-مرور-قوية-12+' npx tsx scripts/create-admin.ts
```

ثم من «المستخدمون والفروع» اضغط **مزامنة من موقع الجوبي**.

## ما يتحقق منه التطبيق عند الإقلاع

في الإنتاج يتوقف الخادم (exit 1) برسالة واضحة إن نقص `DATABASE_URL` أو `APP_URL` (يجب أن يكون https) أو `STORAGE_DIR`. راجع `journalctl -u aljoby-fsm` إن لم يقلع. قائمة الإطلاق الكاملة: [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md).

## Nginx وsystemd

ملفات جاهزة في `deploy/`: `nginx-aljoby-fsm.conf` (HTTPS، وX-Forwarded-For يُستبدل بعنوان الاتصال الفعلي كي لا يُزوَّر حد المحاولات) و`aljoby-fsm.service` (استماع على 127.0.0.1 فقط، وإعادة تشغيل تلقائية، وتوقف بعد 5 إخفاقات إقلاع في دقيقة). الأسرار في `/etc/aljoby-fsm.env` (chmod 600) وليس في المستودع. **لم تُجرَّب على خادم حقيقي بعد** — جرّبها على خادم تجريبي أولًا (`nginx -t`، ثم الإقلاع، ثم `/api/v1/health` عبر النطاق).

## المهام الدورية والمراقبة

```bash
# crontab — حذف مواقع الفرق الأقدم من LOCATION_RETENTION_DAYS (إلزامي: التطبيق لا يحذفها بنفسه)
15 3 * * * cd /srv/aljoby-fsm && set -a && . /etc/aljoby-fsm.env && set +a && npx tsx scripts/purge-locations.ts >> /var/log/aljoby-fsm-purge.log 2>&1
```

- فحص الصحة: `GET /api/v1/health` يعطي 200 `{"status":"ok"}`، أو 503 إن انقطعت القاعدة. اربطه بأداة المراقبة.
- كل خطأ غير متوقع يُسجَّل سطر JSON واحدًا فيه `requestId`، والرد يحمل نفس القيمة في `x-request-id`. ليمرّر Nginx معرّفه أضف `proxy_set_header X-Request-Id $request_id;`.

## التحديث

الأسهل: `deploy/deploy.sh` (نسخة احتياطية، ثم تحديث، ثم ترحيل، ثم بناء، ثم إعادة تشغيل، ثم فحص صحة مع طباعة التراجع عند الفشل). يحتاج حساب التطبيق صلاحية `sudo systemctl restart aljoby-fsm` فقط (سطر في sudoers). يدويًا:

```bash
git pull && npm ci && npx prisma migrate deploy && npm run build && systemctl restart aljoby-fsm
```

الترحيلات إضافية فقط (لا حذف أعمدة في نفس الإصدار الذي يتوقف عن استخدامها).

## النسخ الاحتياطي والاستعادة

```bash
# يوميًا عبر cron (يقصّ معاملات Prisma من الرابط لأن pg_dump يرفضها، ويفشل بصوت عالٍ عند نسخة فارغة)
30 2 * * * set -a; . /etc/aljoby-fsm.env; set +a; /srv/aljoby-fsm/deploy/backup.sh >> /var/log/aljoby-fsm-backup.log 2>&1
# الاستعادة (على خادم تجريبي أولًا؛ لاحظ حذف ما بعد ? من الرابط)
pg_restore --clean --if-exists -d "${DATABASE_URL%%?*}" /backup/fsm-db-YYYY-MM-DD-HHMMSS.dump
tar xzf /backup/fsm-files-YYYY-MM-DD-HHMMSS.tgz -C "$STORAGE_DIR"
```

للنسخ خارج الخادم عرّف `OFFSITE_RCLONE_REMOTE` (يستعمل rclone)، وبدونه يطبع السكربت تحذيرًا.

احتفظ بالنسخ خارج الخادم. **جرّب الاستعادة على خادم تجريبي مرة واحدة على الأقل قبل الإطلاق** — نسخة لم تُجرَّب استعادتها ليست ضمانًا. سياسة الاحتفاظ بالصور والتواقيع: تُقرّرها الإدارة (مقترح: 24 شهرًا).
