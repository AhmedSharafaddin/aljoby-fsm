import { body, route } from '@/lib/api';
import { addNote } from '@/modules/tasks';
export const POST = route(async ({ req, actor, params }) => addNote(actor, params.id, await body(req)));
