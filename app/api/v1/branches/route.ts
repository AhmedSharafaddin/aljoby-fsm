import { route } from '@/lib/api';
import { db } from '@/lib/core';
export const GET = route(async () => db.branch.findMany({ where: { isActive: true }, orderBy: [{ city: 'asc' }, { name: 'asc' }] }));
