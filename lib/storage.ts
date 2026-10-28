// تخزين الأدلة (صور/توقيعات) خارج public — تُقدَّم فقط عبر /api/v1/files/:id بعد فحص الصلاحية.
// ponytail: قرص محلي؛ للإنتاج على أكثر من خادم استبدل saveFile/readFile بتخزين كائنات S3 خاص.
import { randomUUID } from 'node:crypto';
import { mkdir, readFile as fsRead, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AppError } from './core';

const DIR = path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR || 'storage');
export const MAX_BYTES = 5 * 1024 * 1024;

/** النوع الفعلي من أول بايتات الملف — لا نثق بالامتداد ولا بما يرسله المتصفح. */
export function sniffImage(b: Uint8Array): { mime: string; ext: string } | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { mime: 'image/png', ext: 'png' };
  const ascii = (s: number, e: number) => String.fromCharCode(...b.slice(s, e));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

export async function saveImage(file: File) {
  if (file.size > MAX_BYTES) throw new AppError(413, 'حجم الصورة أكبر من 5 ميجابايت');
  const buf = new Uint8Array(await file.arrayBuffer());
  const type = sniffImage(buf);
  if (!type) throw new AppError(415, 'يُقبل JPG أو PNG أو WebP فقط');
  const key = `${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${type.ext}`;
  await mkdir(path.join(/*turbopackIgnore: true*/ DIR, path.dirname(key)), { recursive: true });
  await writeFile(path.join(/*turbopackIgnore: true*/ DIR, key), buf);
  return { key, mime: type.mime };
}

export function readStored(key: string) {
  const full = path.join(/*turbopackIgnore: true*/ DIR, key);
  if (!full.startsWith(DIR + path.sep)) throw new AppError(404, 'غير موجود');
  return fsRead(/*turbopackIgnore: true*/ full); // المسار من STORAGE_DIR وقت التشغيل
}
