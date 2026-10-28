import { body, route } from '@/lib/api';
import { setTeamMember } from '@/modules/service';
export const POST = route(async ({ req, actor, params }) => setTeamMember(actor, params.id, await body(req)));
