// الصلاحيات: ماذا يستطيع الدور (can)، وأي السجلات يراها (scopes).
// كل استعلام في modules يمر عبر هذه النطاقات — الواجهة لا تُخفي شيئًا بنفسها.
import type { Prisma, Role } from '@prisma/client';
import type { Actor } from './auth';
import { forbidden } from './core';

export const MANAGERS: Role[] = ['ADMIN', 'SERVICE_MANAGER'];
export const FIELD: Role[] = ['INSTALLER', 'CARPET_LAYER', 'DRIVER'];
export const isField = (r: Role) => FIELD.includes(r);

const CAPS = {
  'order.create': [...MANAGERS, 'BRANCH'],
  'order.approve': MANAGERS,
  'order.hold': MANAGERS,
  'order.assign': [...MANAGERS, 'SUPERVISOR'],
  'order.reviewLink': [...MANAGERS, 'BRANCH'],
  'complaint.create': [...MANAGERS, 'BRANCH'],
  'complaint.manage': MANAGERS,
  'team.manage': MANAGERS,
  'user.manage': MANAGERS,
  'branch.sync': ['ADMIN'],
  'report.view': MANAGERS,
  'cost.manage': MANAGERS,
  'dashboard.view': [...MANAGERS, 'SUPERVISOR', 'BRANCH'],
  'field.work': FIELD,
} satisfies Record<string, Role[]>;
export type Cap = keyof typeof CAPS;

export const can = (actor: Pick<Actor, 'role'>, cap: Cap) => (CAPS[cap] as Role[]).includes(actor.role);
export function assertCan(actor: Pick<Actor, 'role'>, cap: Cap) {
  if (!can(actor, cap)) throw forbidden();
}

/** التكليفات التي يعمل عليها الموظف الميداني: المسندة له مباشرة أو لفريقه. */
export function fieldAssignmentScope(actor: Actor): Prisma.TaskAssignmentWhereInput {
  return { OR: [{ assigneeId: actor.id }, { team: { members: { some: { userId: actor.id } } } }] };
}

/** الطلبات المرئية لكل دور. */
export function orderScope(actor: Actor): Prisma.ServiceOrderWhereInput {
  switch (actor.role) {
    case 'ADMIN':
    case 'SERVICE_MANAGER':
      return {};
    case 'SUPERVISOR':
      // الطلبات المعتمدة بانتظار التوزيع + طلبات فرقه
      return { OR: [{ status: 'APPROVED' }, { assignments: { some: { team: { supervisorId: actor.id } } } }] };
    case 'BRANCH':
      return { branchId: actor.branchId ?? '00000000-0000-0000-0000-000000000000' };
    default:
      return { assignments: { some: fieldAssignmentScope(actor) } };
  }
}

export function complaintScope(actor: Actor): Prisma.ComplaintWhereInput {
  if (MANAGERS.includes(actor.role)) return {};
  if (actor.role === 'BRANCH') return { branchId: actor.branchId ?? '00000000-0000-0000-0000-000000000000' };
  return { id: '00000000-0000-0000-0000-000000000000' }; // لا شيء
}
