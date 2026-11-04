#!/usr/bin/env bash
# نسخ احتياطي: القاعدة + مجلد الصور. يفشل بصوت عالٍ (رمز خروج ≠ 0) كي يلحظه cron والمراقبة.
# يُشغَّل يوميًا بحساب التطبيق: 30 2 * * * set -a; . /etc/aljoby-fsm.env; set +a; /srv/aljoby-fsm/deploy/backup.sh
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL غير معرّف}"
: "${STORAGE_DIR:?STORAGE_DIR غير معرّف}"
BACKUP_DIR="${BACKUP_DIR:-/backup}"
KEEP_DAYS="${KEEP_DAYS:-14}"
stamp="$(date +%F-%H%M%S)"

umask 077 # النسخ فيها بيانات عملاء
mkdir -p "$BACKUP_DIR"
db_file="$BACKUP_DIR/fsm-db-$stamp.dump"
files_file="$BACKUP_DIR/fsm-files-$stamp.tgz"

trap 'rm -f "$db_file.tmp"' EXIT # لا نترك ملفًا جزئيًا إن فشل pg_dump

# pg_dump لا يقبل معاملات Prisma في الرابط (?schema= أو connection_limit= أو pgbouncer=) فنقصّ ما بعد "?"
pg_dump -Fc --no-owner "${DATABASE_URL%%\?*}" > "$db_file.tmp"
mv "$db_file.tmp" "$db_file"
tar czf "$files_file" -C "$STORAGE_DIR" .

# ملف فارغ = نسخة ميتة، لا نقبله بصمت
if ! { [ -s "$db_file" ] && [ -s "$files_file" ]; }; then
  echo "نسخة فارغة: $db_file / $files_file" >&2
  rm -f "$db_file" "$files_file" # لا يبقى ملف يشبه نسخة سليمة وهو ميت
  exit 1
fi

if [ -n "${OFFSITE_RCLONE_REMOTE:-}" ]; then
  rclone copy "$BACKUP_DIR" "$OFFSITE_RCLONE_REMOTE" --include "fsm-*-$stamp.*"
else
  echo "تحذير: لا نسخ خارج الخادم (OFFSITE_RCLONE_REMOTE غير معرّف). النسخة على نفس الخادم لا تحميك من فقدانه." >&2
fi

find "$BACKUP_DIR" -maxdepth 1 -name 'fsm-*' -mtime +"$KEEP_DAYS" -delete
echo "{\"level\":\"info\",\"job\":\"backup\",\"db\":\"$db_file\",\"files\":\"$files_file\"}"
