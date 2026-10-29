// إعداد ESLint الرسمي لـ Next (قواعد Core Web Vitals + TypeScript) كما هو، بلا قواعد مخصصة.
import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

const config = [...coreWebVitals, ...typescript, { ignores: ['.next/**', 'node_modules/**', 'storage/**', '.test-storage/**', 'next-env.d.ts'] }];

export default config;
