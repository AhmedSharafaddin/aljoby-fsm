import { clearCookie, logout, tokenFromRequest } from '@/lib/auth';

export async function POST(req: Request) {
  await logout(tokenFromRequest(req));
  return Response.json({ data: null }, { headers: { 'Set-Cookie': clearCookie() } });
}
