import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPort = Number(process.env.VOTE5_SERVER_PORT || 5749);
const serverTarget = `http://127.0.0.1:${serverPort}`;

/** `file://` ile açılışta Chrome/Edge, crossorigin'li yerel modül/CSS'i yüklemez (beyaz ekran). */
function stripLocalAssetCrossorigin() {
  return {
    name: 'strip-local-asset-crossorigin',
    transformIndexHtml(html) {
      return html
        .replace(/<script(\s+type="module")\s+crossorigin(\s+src="\.\/)/g, '<script$1$2')
        .replace(/<link(\s+rel="stylesheet")\s+crossorigin(\s+href="\.\/)/g, '<link$1$2');
    },
  };
}

/**
 * Chrome: file:// + type="module" altındaki chunk yüklemesi "null origin" CORS ile bloklanır.
 * Tek IIFE çıktısı + klasik script etiketi ile çift tıklama çalışır.
 */
function classicIifeScript() {
  return {
    name: 'classic-iife-script',
    transformIndexHtml(html) {
      return html.replace(/<script type="module" /g, '<script ');
    },
  };
}

/** Betik <head> içinde kalırsa senkron çalışır; #root henüz yok → createRoot(null) → React #299 */
function deferVote5Bundle() {
  return {
    name: 'defer-vote5-bundle',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html.replace(
          /<script(?![^>]*\bdefer\b)([^>]*\bsrc="[^"]*\/assets\/vote5\.js"[^>]*)><\/script>/i,
          '<script defer$1></script>'
        );
      },
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), stripLocalAssetCrossorigin(), classicIifeScript(), deferVote5Bundle()],
  root: __dirname,
  server: {
    fs: {
      allow: [path.join(__dirname, '..')],
    },
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/socket.io': {
        target: serverTarget,
        ws: true,
      },
      '/api': {
        target: serverTarget,
      },
      '/gift-images': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    /** Çift tıklanabilir oyun: `play/index.html` — klasik script (Chrome file:// CORS). */
    outDir: path.join(__dirname, '..', 'play'),
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        format: 'iife',
        name: 'Vote5',
        inlineDynamicImports: true,
        entryFileNames: 'assets/vote5.js',
        chunkFileNames: 'assets/vote5-[hash].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
