import { body, route } from '@/lib/api';
import { assertCan } from '@/lib/permissions';
import { teamStates } from '@/modules/reports';
import { createTeam } from '@/modules/service';

export const GET = route(async ({ actor }) => {
  assertCan(actor, 'order.assign'); // حالة الفرق وأعضاؤها للإدارة والمشرف فقط، لا للفروع
  return teamStates(actor);
});
export const POST = route(async ({ req, actor }) => createTeam(actor, await body(req)));
