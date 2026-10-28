import { body, route } from '@/lib/api';
import { assignOrder } from '@/modules/orders';
export const POST = route(async ({ req, actor, params }) => assignOrder(actor, params.id, await body(req)));
