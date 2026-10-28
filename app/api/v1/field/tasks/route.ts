import { route } from '@/lib/api';
import { listMyTasks } from '@/modules/tasks';
export const GET = route(async ({ actor }) => listMyTasks(actor));
