import { execSync } from 'node:child_process';
import { loadEnv } from 'vite';

/** يطبّق الترحيلات على قاعدة الاختبار قبل التشغيل. */
export default function setup() {
  const url = loadEnv('test', process.cwd(), '').TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL غير معرّف في .env');
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
}
