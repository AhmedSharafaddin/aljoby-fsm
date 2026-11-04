// فحص إعدادات الإنتاج عند الإقلاع: التطبيق يرفض العمل بإعداد ناقص بدل أن يفشل لاحقًا أمام المستخدم.
type Env = Record<string, string | undefined>;

/** قائمة المشاكل (فارغة = سليم). خارج الإنتاج لا شيء مطلوب. */
export function missingProdEnv(env: Env): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const problems: string[] = [];
  for (const name of ['DATABASE_URL', 'APP_URL', 'STORAGE_DIR']) {
    if (!env[name]?.trim()) problems.push(`${name} غير معرّف`);
  }
  const app = env.APP_URL?.trim();
  if (app) {
    // رابط التقييم يُرسل للعملاء فيجب أن يكون https، ويُقبل http لتشغيل محلي بوضع الإنتاج فقط
    const url = URL.canParse(app) ? new URL(app) : null;
    const local = url && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (!url || (url.protocol !== 'https:' && !local)) problems.push('APP_URL يجب أن يكون عنوان https صالحًا');
  }
  return problems;
}
