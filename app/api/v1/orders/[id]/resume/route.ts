import { body, route } from '@/lib/api';
import { setOrderState } from '@/modules/orders';
export const POST = route(async ({ req, actor, params }) => setOrderState(actor, params.id, 'APPROVED', await body(req)));
