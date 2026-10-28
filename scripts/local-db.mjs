// PostgreSQL محلي بلا Docker ولا تثبيت (PGlite = Postgres حقيقي مبني WebAssembly) — للتطوير والاختبار فقط.
//   npm run db:local          → قاعدة التطوير على 5432 (.pgdata)
//   npm run db:local -- test  → قاعدة الاختبار على 5433 (.pgdata-test)
// ponytail: PGlite محرك واحد تتشاركه الاتصالات؛ لذلك pgbouncer=true (لا prepared statements مشتركة) في .env. الإنتاج: PostgreSQL عادي.
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const test = process.argv[2] === 'test';
const db = await PGlite.create(test ? './.pgdata-test' : './.pgdata');
// عدة اتصالات تُصفّ استعلاماتها على نفس المحرك (Next يفتح أكثر من اتصال)
const server = new PGLiteSocketServer({ db, port: test ? 5433 : 5432, host: '127.0.0.1', maxConnections: 10 });
await server.start();
console.log(`PostgreSQL (PGlite) يعمل على 127.0.0.1:${test ? 5433 : 5432}. Ctrl+C للإيقاف.`);

const stop = async () => {
  await server.stop();
  await db.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
