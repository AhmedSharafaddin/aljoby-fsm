import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/client';
import { currentActor } from '@/lib/session';

export const metadata = { title: 'تسجيل الدخول' };

export default async function LoginPage() {
  if (await currentActor()) redirect('/');
  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <div className="card w-full max-w-sm space-y-6 p-6">
        <div className="text-center">
          <div className="text-xs font-semibold tracking-widest text-gold">الجوبي · ١٩٧٩</div>
          <h1 className="mt-1 text-2xl font-bold text-brand">الخدمات الميدانية</h1>
          <p className="mt-1 text-sm text-ink-muted">التركيب والفرش والتوصيل</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
