import { ApiButton, ApiForm } from '@/components/client';
import { Title } from '@/components/ui';
import { db } from '@/lib/core';
import { ar } from '@/lib/labels';
import { can, MANAGERS } from '@/lib/permissions';
import { requirePage } from '@/lib/session';

export const metadata = { title: 'المستخدمون والفروع' };

export default async function Settings() {
  const actor = await requirePage('user.manage');
  const [users, branches] = await Promise.all([
    db.user.findMany({ include: { branch: true }, orderBy: [{ isActive: 'desc' }, { name: 'asc' }] }),
    db.branch.findMany({ orderBy: [{ isActive: 'desc' }, { city: 'asc' }, { name: 'asc' }] }),
  ]);
  const roles = Object.entries(ar.role).filter(([r]) => actor.role === 'ADMIN' || !MANAGERS.includes(r as never));

  return (
    <>
      <Title>المستخدمون والفروع</Title>
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section className="card overflow-x-auto p-0">
          <table className="table">
            <thead><tr><th>الاسم</th><th>الهاتف</th><th>الدور</th><th>الفرع</th><th></th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={u.isActive ? '' : 'opacity-50'}>
                  <td>{u.name}</td>
                  <td dir="ltr" className="text-end">+{u.phone}</td>
                  <td>{ar.role[u.role]}</td>
                  <td>{u.branch?.name ?? '—'}</td>
                  <td>
                    {u.id !== actor.id && (actor.role === 'ADMIN' || !MANAGERS.includes(u.role)) && (
                      <ApiButton
                        action={`/api/v1/users/${u.id}`}
                        body={{ isActive: !u.isActive }}
                        label={u.isActive ? 'إيقاف' : 'تفعيل'}
                        variant="btn-outline"
                        confirm={u.isActive ? 'إيقاف الحساب ينهي جلساته فورًا. متابعة؟' : undefined}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <ApiForm action="/api/v1/users" submit="إنشاء الحساب" reset success="أُنشئ الحساب" className="card space-y-3 self-start">
          <h2 className="font-bold">حساب جديد</h2>
          <input name="name" className="input" placeholder="الاسم" required aria-label="الاسم" />
          <input name="phone" className="input" placeholder="رقم الهاتف" required dir="ltr" aria-label="الهاتف" />
          <input name="password" type="password" className="input" placeholder="كلمة مرور مؤقتة (8+ أحرف)" minLength={8} required dir="ltr" aria-label="كلمة المرور" />
          <select name="role" className="input" aria-label="الدور">
            {roles.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select name="branchId" className="input" aria-label="الفرع (لحسابات الفروع)">
            <option value="">الفرع (لحسابات الفروع فقط)</option>
            {branches.filter((b) => b.isActive).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </ApiForm>
      </div>

      <section className="mt-8">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">الفروع ({branches.filter((b) => b.isActive).length})</h2>
          {can(actor, 'branch.sync') && <ApiButton action="/api/v1/branches/sync" label="مزامنة من موقع الجوبي" variant="btn-outline" />}
        </div>
        <p className="mb-3 text-sm text-ink-muted">الفروع تُدار في موقع الشركة (ووردبريس ← الفروع) وتُقرأ من هناك — لا تُكرَّر هنا.</p>
        <div className="grid gap-2 md:grid-cols-3">
          {branches.map((b) => (
            <div key={b.id} className={`card text-sm ${b.isActive ? '' : 'opacity-50'}`}>
              <b>{b.name}</b> {b.wpId == null && <span className="text-xs text-warn">(تجريبي)</span>}
              <div className="text-ink-muted">{[b.city, b.address].filter(Boolean).join(' · ') || '—'}</div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
