import { route } from '@/lib/api';
import { readFileFor } from '@/modules/tasks';
export const GET = route(async ({ actor, params }) => {
  const f = await readFileFor(actor, params.id);
  return new Response(new Uint8Array(f.body), {
    headers: { 'Content-Type': f.mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
  });
});
