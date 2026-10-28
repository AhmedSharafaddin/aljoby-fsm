import { body, route } from '@/lib/api';
import { reportIssue } from '@/modules/tasks';
export const POST = route(async ({ req, actor, params }) => reportIssue(actor, params.id, await body(req)));
