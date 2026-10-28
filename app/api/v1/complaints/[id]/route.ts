import { body, route } from '@/lib/api';
import { updateComplaint } from '@/modules/service';
export const PATCH = route(async ({ req, actor, params }) => updateComplaint(actor, params.id, await body(req)));
