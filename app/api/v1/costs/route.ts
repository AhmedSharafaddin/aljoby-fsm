import { body, route } from '@/lib/api';
import { createCost } from '@/modules/reports';
export const POST = route(async ({ req, actor }) => createCost(actor, await body(req)));
