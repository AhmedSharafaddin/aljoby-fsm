import { body, query, route } from '@/lib/api';
import { createComplaint, listComplaints } from '@/modules/service';
export const GET = route(async ({ req, actor }) => listComplaints(actor, query(req).status));
export const POST = route(async ({ req, actor }) => createComplaint(actor, await body(req)));
