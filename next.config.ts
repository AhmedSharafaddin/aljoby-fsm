import type { NextConfig } from 'next';

const config: NextConfig = {
  // argon2 ثنائي أصلي — يبقى خارج الحزمة
  serverExternalPackages: ['@node-rs/argon2'],
  poweredByHeader: false,
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        // تتجاهلها المتصفحات على http (التطوير المحلي)؛ بلا includeSubDomains كي لا تمسّ نطاقات أخرى للشركة
        { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'same-origin' },
        { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=()' },
      ],
    }];
  },
};
export default config;
