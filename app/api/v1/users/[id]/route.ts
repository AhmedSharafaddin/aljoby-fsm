import { body, route } from '@/lib/api';
import { updateUser } from '@/modules/service';
export const PATCH = route(async ({ req, actor, params }) => updateUser(actor, params.id, await body(req)));
