import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Content Security Policy for the renderer. Production allows only bundled
 * scripts and styles. Development additionally allows the inline React
 * Refresh preamble and the dev server's websocket for hot reload.
 */
function contentSecurityPolicy(): Plugin {
  const production = [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join('; ');
  const development = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self' ws://localhost:* http://localhost:*",
    "base-uri 'none'",
    "object-src 'none'",
  ].join('; ');
  return {
    name: 'profile-switcher-csp',
    transformIndexHtml(_html, context) {
      const policy = context.server ? development : production;
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: policy },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

const sharedAlias = { '@shared': resolve(__dirname, 'src/shared') };

export default defineConfig({
  main: {
    resolve: { alias: sharedAlias },
    build: {
      outDir: 'out/main',
      rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts') } },
    },
  },
  preload: {
    resolve: { alias: sharedAlias },
    build: {
      outDir: 'out/preload',
      // The renderer is sandboxed, so the preload script must be a single
      // self-contained CommonJS file with no runtime `require` of packages.
      externalizeDeps: false,
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
        output: { format: 'cjs', entryFileNames: '[name].js' },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: { alias: sharedAlias },
    plugins: [react(), contentSecurityPolicy()],
    build: {
      outDir: resolve(__dirname, 'out/renderer'),
      minify: 'esbuild',
      rollupOptions: { input: { index: resolve(__dirname, 'src/renderer/index.html') } },
    },
  },
});
