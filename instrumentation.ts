// يعمل مرة عند إقلاع الخادم (Next.js): بإعداد إنتاج ناقص يتوقف التشغيل — انظر instrumentation-node.ts.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('./instrumentation-node');
}
