import { query, route } from '@/lib/api';
import { dashboardSummary } from '@/modules/reports';
export const GET = route(async ({ req, actor }) => dashboardSummary(actor, query(req).date));
