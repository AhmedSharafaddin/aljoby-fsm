import { query, route } from '@/lib/api';
import { ordersReport, toCsv } from '@/modules/reports';
export const GET = route(async ({ req, actor }) => {
  const q = query(req);
  const r = await ordersReport(actor, { from: q.from, to: q.to });
  const rows = r.byBranch;
  if (q.format !== 'csv') return { from: r.from, to: r.to, items: rows };
  return new Response(toCsv(rows), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="branches-${r.from}-${r.to}.csv"` },
  });
});
