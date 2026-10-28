import { route } from '@/lib/api';
import { getTask } from '@/modules/tasks';
export const GET = route(async ({ actor, params }) => getTask(actor, params.id));
