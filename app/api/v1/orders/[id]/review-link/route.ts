import { route } from '@/lib/api';
import { createReviewLink } from '@/modules/orders';
export const POST = route(async ({ req, actor, params }) => createReviewLink(actor, params.id, new URL(req.url).origin));
