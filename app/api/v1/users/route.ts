import { body, route } from '@/lib/api';
import { db } from '@/lib/core';
import { assertCan } from '@/lib/permissions';
import { createUser } from '@/modules/service';

export const GET = route(async ({ actor }) => {
  assertCan(actor, 'user.manage');
  return db.user.findMany({ select: { id: true, name: true, phone: true, role: true, branchId: true, isActive: true }, orderBy: { name: 'asc' } });
});
export const POST = route(async ({ req, actor }) => createUser(actor, await body(req)));
