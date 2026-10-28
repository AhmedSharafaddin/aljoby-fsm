import { query, route } from '@/lib/api';
import { costsReport, toCsv } from '@/modules/reports';
export const GET = route(async ({ req, actor }) => {
  const q = query(req);
  const r = await costsReport(actor, { from: q.from, to: q.to });
  if (q.format !== 'csv') return r;
  return new Response(toCsv(r.items), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="costs-${r.from}-${r.to}.csv"` },
  });
});
