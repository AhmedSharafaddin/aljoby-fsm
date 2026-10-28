import { body, query, route } from '@/lib/api';
import { createOrder, listOrders } from '@/modules/orders';
export const GET = route(async ({ req, actor }) => listOrders(actor, query(req)));
export const POST = route(async ({ req, actor }) => createOrder(actor, await body(req)));
