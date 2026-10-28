import { route } from '@/lib/api';
import { uploadFile } from '@/modules/tasks';
export const POST = route(async ({ req, actor, params }) => {
  const f = await uploadFile(actor, params.id, await req.formData());
  return { id: f.id, kind: f.kind };
});
