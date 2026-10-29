import { errorResponse } from '@/lib/api';
import { rateLimit } from '@/lib/core';
import { submitReview } from '@/modules/service';

// بلا جلسة: الرابط نفسه هو الإذن، ويُستخدم مرة واحدة.
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
    rateLimit(`review:${ip}`, 20, 60 * 60_000);
    await submitReview((await ctx.params).token, await req.json().catch(() => ({})));
    return Response.json({ data: null });
  } catch (e) {
    return errorResponse(e, req);
  }
}
