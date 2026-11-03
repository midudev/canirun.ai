// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import cloudflare from '@astrojs/cloudflare';
import { astroRedirects } from './src/lib/seo-pages.ts';

/** Google Fonts latin — enough for the English UI without latin-ext/CJK. */
const LATIN_UNICODE_RANGE = [
  'U+0000-00FF',
  'U+0131',
  'U+0152-0153',
  'U+02BB-02BC',
  'U+02C6',
  'U+02DA',
  'U+02DC',
  'U+0304',
  'U+0308',
  'U+0329',
  'U+2000-206F',
  'U+20AC',
  'U+2122',
  'U+2191',
  'U+2193',
  'U+2212',
  'U+2215',
  'U+FEFF',
  'U+FFFD',
];

// https://astro.build/config
export default defineConfig({
  site: 'https://canirun.ai',
  adapter: cloudflare({
    // OG images (satori + resvg + sharp) are prerendered at build time and need native Node modules.
    prerenderEnvironment: 'node',
    // Everything is prerendered: optimize images at build time, no runtime Images binding.
    imageService: 'compile',
  }),
  // No Astro sessions are used; avoid provisioning a KV namespace for them.
  session: false,
  fonts: [
    {
      provider: fontProviders.local(),
      name: 'Geist Sans',
      cssVariable: '--font-geist-sans',
      display: 'optional',
      fallbacks: ['ui-sans-serif', 'system-ui', 'sans-serif'],
      unicodeRange: LATIN_UNICODE_RANGE,
      options: {
        variants: [
          { weight: 300, style: 'normal', src: ['./src/assets/fonts/Geist-Light.woff2'] },
          { weight: 400, style: 'normal', src: ['./src/assets/fonts/Geist-Regular.woff2'] },
          { weight: 500, style: 'normal', src: ['./src/assets/fonts/Geist-Medium.woff2'] },
          { weight: 600, style: 'normal', src: ['./src/assets/fonts/Geist-SemiBold.woff2'] },
          { weight: 700, style: 'normal', src: ['./src/assets/fonts/Geist-Bold.woff2'] },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: 'Geist Mono',
      cssVariable: '--font-geist-mono',
      display: 'optional',
      fallbacks: ['ui-monospace', 'monospace'],
      unicodeRange: LATIN_UNICODE_RANGE,
      options: {
        variants: [
          { weight: 400, style: 'normal', src: ['./src/assets/fonts/GeistMono-Regular.woff2'] },
          { weight: 500, style: 'normal', src: ['./src/assets/fonts/GeistMono-Medium.woff2'] },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: 'Geist Pixel',
      cssVariable: '--font-geist-pixel',
      display: 'optional',
      fallbacks: ['ui-monospace', 'monospace'],
      unicodeRange: LATIN_UNICODE_RANGE,
      options: {
        variants: [
          { weight: 500, style: 'normal', src: ['./src/assets/fonts/GeistPixel-Square.woff2'] },
        ],
      },
    },
  ],
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/api/') && !page.includes('/og/'),
      serialize(item) {
        const url = item.url;
        if (url === 'https://canirun.ai/') {
          return { ...item, priority: 1, changefreq: 'daily' };
        }
        if (
          url === 'https://canirun.ai/models' ||
          url.includes('/models/') ||
          url.includes('/vram/')
        ) {
          return { ...item, priority: 0.9, changefreq: 'weekly' };
        }
        if (url.includes('/device') || url.includes('/company/')) {
          return { ...item, priority: 0.8, changefreq: 'weekly' };
        }
        if (url.includes('/model/')) {
          return { ...item, priority: 0.7, changefreq: 'weekly' };
        }
        return { ...item, priority: 0.5, changefreq: 'monthly' };
      },
    }),
  ],
  redirects: astroRedirects(),
  vite: {
    plugins: [tailwindcss()],
    // Native, build-time-only deps for OG images: never pre-bundle them for the workerd dev environment.
    optimizeDeps: {
      exclude: ['@resvg/resvg-js', 'sharp'],
    },
    worker: {
      format: 'es'
    }
  }
});
