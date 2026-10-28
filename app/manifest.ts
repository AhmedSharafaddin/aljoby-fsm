import type { MetadataRoute } from 'next';

// PWA: يُثبَّت على شاشة هاتف الفريق الميداني ويفتح مباشرة على «مهامي».
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'خدمات الجوبي الميدانية',
    short_name: 'خدمات الجوبي',
    lang: 'ar',
    dir: 'rtl',
    start_url: '/',
    display: 'standalone',
    background_color: '#F6F3ED',
    theme_color: '#316A21',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
