import { route } from '@/lib/api';
import { startTask } from '@/modules/tasks';
export const POST = route(async ({ actor, params }) => startTask(actor, params.id));
