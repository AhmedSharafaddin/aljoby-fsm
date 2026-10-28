import { route } from '@/lib/api';
import { approveOrder } from '@/modules/orders';
export const POST = route(async ({ actor, params }) => approveOrder(actor, params.id));
