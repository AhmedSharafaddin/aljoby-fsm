// كود Node فقط (process.exit) — منفصل عن instrumentation.ts كي لا يحلّله بانٍ Edge Runtime.
import { missingProdEnv } from '@/lib/env';

const problems = missingProdEnv(process.env);
if (problems.length) {
  // throw وحده يطبع الخطأ لكن تبقى العملية حيّة؛ نخرج برمز فشل كي يلحظه systemd/pm2 ولا يخدم الخادم بإعداد ناقص
  console.error(`إعداد الإنتاج غير مكتمل:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
