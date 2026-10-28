import { body, route } from '@/lib/api';
import { setOrderState } from '@/modules/orders';
export const POST = route(async ({ req, actor, params }) => setOrderState(actor, params.id, 'CANCELLED', await body(req)));
