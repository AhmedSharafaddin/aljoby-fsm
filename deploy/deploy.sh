#!/usr/bin/env bash
# نشر إصدار جديد: نسخة احتياطية ← تحديث الكود ← ترحيل ← بناء ← إعادة تشغيل ← فحص صحة.
# يُشغَّل على الخادم بحساب التطبيق. إن فشل فحص الصحة يطبع طريقة التراجع ويخرج برمز فشل.
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/aljoby-fsm}"
SERVICE="${SERVICE:-aljoby-fsm}"
cd "$APP_DIR"

# قيم الإعداد (ضعها بين علامتي تنصيص في الملف كي تُقرأ هنا وفي systemd معًا)
set -a
# shellcheck disable=SC1091
. /etc/aljoby-fsm.env
set +a

prev="$(git rev-parse HEAD)"
echo "الإصدار الحالي: $prev"

./deploy/backup.sh # نسخة ما قبل الترحيل: هي طريق العودة الوحيد لو أفسد الترحيل بيانات

git fetch origin
git merge --ff-only origin/main
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
sudo systemctl restart "$SERVICE"

for _ in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:3000/api/v1/health > /dev/null; then
    echo "تم: الخادم سليم عند $(git rev-parse --short HEAD)"
    exit 0
  fi
  sleep 2
done

cat >&2 <<EOF
فشل فحص الصحة بعد النشر. للتراجع عن الكود:
  git checkout $prev && npm ci && npx prisma generate && npm run build && sudo systemctl restart $SERVICE
الترحيلات إضافية فقط فلا تحتاج عكسًا. الاستعادة من نسخة ما قبل الترحيل في \$BACKUP_DIR (الافتراضي /backup) للحالة القصوى فقط.
السجل: journalctl -u $SERVICE -n 100
EOF
exit 1
