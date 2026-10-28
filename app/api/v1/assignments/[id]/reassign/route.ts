import { body, route } from '@/lib/api';
import { reassign } from '@/modules/orders';
export const POST = route(async ({ req, actor, params }) => reassign(actor, params.id, await body(req)));
