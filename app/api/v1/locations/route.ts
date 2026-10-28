import { body, route } from '@/lib/api';
import { shareLocation } from '@/modules/tasks';
export const POST = route(async ({ req, actor }) => shareLocation(actor, await body(req)));
