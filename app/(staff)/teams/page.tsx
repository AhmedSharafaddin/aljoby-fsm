import { ApiButton, ApiForm } from '@/components/client';
import { Badge, Empty, Title } from '@/components/ui';
import { db } from '@/lib/core';
import { ar } from '@/lib/labels';
import { can } from '@/lib/permissions';
import { requirePage } from '@/lib/session';
import { teamStates } from '@/modules/reports';

export const metadata = { title: 'الفرق' };
const FIT = { FURNITURE: 'INSTALLER', CARPET: 'CARPET_LAYER', DELIVERY: 'DRIVER' } as const;

export default async function Teams() {
  const actor = await requirePage('order.assign');
  const manage = can(actor, 'team.manage');
  const [states, teams, staff] = await Promise.all([
    teamStates(actor),
    db.team.findMany({ include: { supervisor: true, members: { include: { user: true } } } }),
    manage ? db.user.findMany({ where: { isActive: true, role: { in: ['INSTALLER', 'CARPET_LAYER', 'DRIVER', 'SUPERVISOR'] } }, orderBy: { name: 'asc' } }) : [],
  ]);
  const byId = new Map(teams.map((t) => [t.id, t]));

  return (
    <>
      <Title>الفرق والأعضاء</Title>
      {states.length === 0 && <Empty>لا توجد فرق في نطاقك.</Empty>}
      <div className="grid gap-3 md:grid-cols-2">
        {states.map((s) => {
          const t = byId.get(s.id)!;
          const candidates = staff.filter((u) => u.role === FIT[t.type] && !t.members.some((m) => m.userId === u.id));
          return (
            <div key={s.id} className="card space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{t.name}</div>
                  <div className="text-xs text-ink-muted">{ar.service[t.type]} · سعة {t.capacity}{t.zone && ` · ${t.zone}`} · المشرف: {t.supervisor?.name ?? '—'}</div>
                </div>
                <Badge value={s.state} label={ar.teamState[s.state]} />
              </div>
              <ul className="text-sm">
                {t.members.map((m) => (
                  <li key={m.userId} className="flex items-center justify-between gap-2 py-1">
                    <span>{m.user.name} · {ar.role[m.user.role]}</span>
                    {manage && <ApiButton action={`/api/v1/teams/${t.id}/members`} body={{ userId: m.userId, remove: true }} label="إزالة" variant="btn-outline" confirm="إزالة العضو من الفريق؟" />}
                  </li>
                ))}
                {t.members.length === 0 && <li className="text-ink-muted">لا أعضاء بعد.</li>}
              </ul>
              {manage && candidates.length > 0 && (
                <ApiForm action={`/api/v1/teams/${t.id}/members`} submit="إضافة" className="flex gap-2">
                  <select name="userId" className="input" required aria-label="موظف">
                    {candidates.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </ApiForm>
              )}
            </div>
          );
        })}
      </div>

      {manage && (
        <ApiForm action="/api/v1/teams" submit="إنشاء الفريق" reset success="أُنشئ الفريق" className="card mt-6 grid max-w-2xl gap-3 md:grid-cols-2">
          <h2 className="font-bold md:col-span-2">فريق جديد</h2>
          <input name="name" className="input" placeholder="اسم الفريق" required aria-label="اسم الفريق" />
          <select name="type" className="input" aria-label="النوع">
            {Object.entries(ar.service).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input name="zone" className="input" placeholder="المنطقة (اختياري)" aria-label="المنطقة" />
          <input name="capacity" type="number" min={1} max={20} defaultValue={1} className="input" aria-label="السعة: مهام متزامنة" title="عدد المهام المتزامنة" />
          <select name="supervisorId" className="input md:col-span-2" aria-label="المشرف">
            <option value="">بلا مشرف</option>
            {staff.filter((u) => u.role === 'SUPERVISOR').map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </ApiForm>
      )}
    </>
  );
}
