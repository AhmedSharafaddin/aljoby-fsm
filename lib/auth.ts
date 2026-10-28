// المصادقة: كلمات مرور Argon2id، وجلسات في قاعدة البيانات تُحفظ ببصمتها فقط.
import { hash, verify } from '@node-rs/argon2';
import { createHash, randomBytes } from 'node:crypto';
import type { Role } from '@prisma/client';
import { AppError, db } from './core';

export const SESSION_COOKIE = 'fsm_session';
const SESSION_DAYS = 7;

export type Actor = { id: string; name: string; role: Role; branchId: string | null };

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');

export const hashPassword = (p: string) => hash(p); // الافتراضي في المكتبة Argon2id
export const verifyPassword = (h: string, p: string) => verify(h, p);

export async function createSession(userId: string) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }); // الجلسات المنتهية لا تتراكم
  await db.session.create({ data: { tokenHash: sha256(token), userId, expiresAt } });
  return { token, expiresAt };
}

export function sessionCookie(token: string, expiresAt: Date) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}${secure}`;
}
export const clearCookie = () => `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

export async function actorFromToken(token: string | undefined): Promise<Actor | null> {
  if (!token) return null;
  const s = await db.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!s || s.expiresAt < new Date() || !s.user.isActive) return null;
  const { id, name, role, branchId } = s.user;
  return { id, name, role, branchId };
}

export function tokenFromRequest(req: Request): string | undefined {
  const cookie = req.headers.get('cookie') ?? '';
  return cookie.split(/;\s*/).find((c) => c.startsWith(SESSION_COOKIE + '='))?.slice(SESSION_COOKIE.length + 1);
}

export async function requireActor(req: Request): Promise<Actor> {
  const actor = await actorFromToken(tokenFromRequest(req));
  if (!actor) throw new AppError(401, 'يجب تسجيل الدخول');
  return actor;
}

export async function login(phone: string, password: string) {
  const user = await db.user.findUnique({ where: { phone } });
  // نتحقق دائمًا حتى لو لم يوجد المستخدم، كي لا يكشف زمن الرد وجود الرقم.
  const ok = await verifyPassword(user?.passwordHash ?? (await (dummyHash ??= hashPassword('no-such-user'))), password).catch(() => false);
  if (!user || !ok || !user.isActive) throw new AppError(401, 'رقم الهاتف أو كلمة المرور غير صحيحة');
  return { user, ...(await createSession(user.id)) };
}
let dummyHash: Promise<string> | undefined;

export async function logout(token: string | undefined) {
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
}
