import { route } from '@/lib/api';
import { getOrder } from '@/modules/orders';
export const GET = route(async ({ actor, params }) => getOrder(actor, params.id));
