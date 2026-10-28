import { route } from '@/lib/api';
import { completeTask } from '@/modules/tasks';
export const POST = route(async ({ actor, params }) => completeTask(actor, params.id));
