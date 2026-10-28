import Link from 'next/link';

export const metadata = { title: 'لا تملك صلاحية' };

export default function Denied() {
  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <div className="card max-w-sm space-y-4 text-center">
        <h1 className="text-xl font-bold">لا تملك صلاحية الوصول لهذه الصفحة</h1>
        <p className="text-ink-muted">إن كنت تحتاجها في عملك، اطلب من مدير الخدمات تعديل صلاحية حسابك.</p>
        <Link href="/" className="btn">العودة لشاشتي</Link>
      </div>
    </main>
  );
}
