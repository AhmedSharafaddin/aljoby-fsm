import { body, route } from '@/lib/api';
import { updateCarpet } from '@/modules/tasks';
export const POST = route(async ({ req, actor, params }) => updateCarpet(actor, params.id, await body(req)));
