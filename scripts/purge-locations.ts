// حذف مواقع الفرق الأقدم من LOCATION_RETENTION_DAYS — يُشغَّل يوميًا عبر cron (انظر docs/DEPLOYMENT.md).
import { db } from '@/lib/core';
import { purgeOldLocations } from '@/modules/tasks';

const count = await purgeOldLocations();
console.log(JSON.stringify({ level: 'info', job: 'purge-locations', deleted: count }));
await db.$disconnect();
