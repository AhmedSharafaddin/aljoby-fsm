import { route } from '@/lib/api';
import { assertCan } from '@/lib/permissions';
import { syncBranches } from '@/modules/service';
export const POST = route(async ({ actor }) => {
  assertCan(actor, 'branch.sync');
  return syncBranches(actor.id);
});
