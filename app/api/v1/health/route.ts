// فحص الصحة للوكيل والمراقبة: بلا جلسة، ولا يكشف تفاصيل الخطأ.
import { db } from '@/lib/core';

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error(JSON.stringify({ level: 'error', path: '/api/v1/health', name: (e as Error)?.name, message: (e as Error)?.message }));
    return Response.json({ status: 'error' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
