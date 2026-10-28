import { route } from '@/lib/api';
export const GET = route(async ({ actor }) => actor);
