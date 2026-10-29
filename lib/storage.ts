// تخزين الأدلة (صور/توقيعات) خارج public — تُقدَّم فقط عبر /api/v1/files/:id بعد فحص الصلاحية.
// ponytail: قرص محلي؛ للإنتاج على أكثر من خادم استبدل saveFile/readFile بتخزين كائنات S3 خاص.
import { randomUUID } from 'node:crypto';
import { mkdir, readFile as fsRead, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AppError } from './core';

const DIR = path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR || 'storage');
export const MAX_BYTES = 5 * 1024 * 1024;

const MAX_SIDE = 20000; // أكبر من أي كاميرا هاتف؛ يمنع رفع صورة صغيرة الحجم بأبعاد خيالية (قنبلة فك ضغط عند من يعرضها)

/** يقرأ أبعاد JPEG من أول علامة SOF، ويطلب علامة النهاية EOI (بعد إهمال أصفار الحشو) ليُكشف الرفع المبتور. */
function jpegOk(b: Uint8Array): boolean {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let end = b.length;
  while (end > 2 && b[end - 1] === 0) end--;
  if (b[end - 2] !== 0xff || b[end - 1] !== 0xd9) return false;
  let i = 2;
  while (i + 4 <= end) {
    if (b[i] !== 0xff) return false;
    const m = b[i + 1];
    if (m === 0xff) { i++; continue; } // حشو
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd8)) { i += 2; continue; } // علامات بلا طول
    const len = view.getUint16(i + 2);
    const isSof = m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
    if (isSof) {
      if (i + 9 > end) return false;
      const h = view.getUint16(i + 5);
      const w = view.getUint16(i + 7);
      return w > 0 && h > 0 && w <= MAX_SIDE && h <= MAX_SIDE;
    }
    if (m === 0xda) return false; // بدأت بيانات الصورة قبل أي SOF
    i += 2 + len;
  }
  return false;
}

/** PNG: ترويسة IHDR بأبعاد معقولة وتذييل IEND. */
function pngOk(b: Uint8Array): boolean {
  if (b.length < 45) return false;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const iend = [0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
  const w = view.getUint32(16);
  const h = view.getUint32(20);
  return (
    sig.every((v, k) => b[k] === v) &&
    view.getUint32(12) === 0x49484452 && // "IHDR"
    w > 0 && h > 0 && w <= MAX_SIDE && h <= MAX_SIDE &&
    iend.every((v, k) => b[b.length - 12 + k] === v)
  );
}

/** WebP: حجم RIFF يطابق الملف تمامًا (يكشف البتر) وأول chunk من الأنواع المعروفة وداخل الملف. */
function webpOk(b: Uint8Array): boolean {
  if (b.length < 20) return false;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const fourcc = String.fromCharCode(b[12], b[13], b[14], b[15]);
  return view.getUint32(4, true) === b.length - 8 && ['VP8 ', 'VP8L', 'VP8X'].includes(fourcc) && 20 + view.getUint32(16, true) <= b.length;
}

/**
 * النوع الفعلي من محتوى الملف — لا نثق بالامتداد ولا بما يرسله المتصفح — مع التأكد أن الصورة مكتملة:
 * ترويسة وحدها (أو ملف مبتور) لا تُقبل دليلًا. لا نفكّ البيكسلات هنا (لا تبعية صور على الخادم).
 * ponytail: بنية الملف لا صحة البيانات المضغوطة؛ أضف مكتبة صور (sharp) إن لزم فك حقيقي.
 */
export function sniffImage(b: Uint8Array): { mime: string; ext: string } | null {
  const ascii = (s: number, e: number) => String.fromCharCode(...b.slice(s, e));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return jpegOk(b) ? { mime: 'image/jpeg', ext: 'jpg' } : null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return pngOk(b) ? { mime: 'image/png', ext: 'png' } : null;
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return webpOk(b) ? { mime: 'image/webp', ext: 'webp' } : null;
  return null;
}

export async function saveImage(file: File) {
  if (file.size > MAX_BYTES) throw new AppError(413, 'حجم الصورة أكبر من 5 ميجابايت');
  const buf = new Uint8Array(await file.arrayBuffer());
  const type = sniffImage(buf);
  if (!type) throw new AppError(415, 'الصورة تالفة أو غير مكتملة — يُقبل JPG أو PNG أو WebP سليمة فقط');
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
