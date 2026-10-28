import { body, route } from '@/lib/api';
import { advanceTrip } from '@/modules/tasks';
export const POST = route(async ({ req, actor, params }) => advanceTrip(actor, params.id, await body(req)));
