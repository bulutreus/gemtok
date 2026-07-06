import { defineConfig } from "vite";

/**
 * `crossorigin` + `file://` veya bazı HTTPS sunucularında stil / modül yüklemesi kesilir
 * (beyaz ekran). Vite çıktısındaki modül script ve `./assets/` stylesheet satırlarından kaldırılır
 * (öznitelik sırasından bağımsız).
 */
function stripCrossoriginFromBuiltHtml() {
  return {
    name: "gemtok-strip-crossorigin-for-file",
    enforce: "post" as const,
    transformIndexHtml(html: string) {
      let out = html.replace(/<script\b[^>]*type=["']module["'][^>]*>/gi, (tag) =>
        tag.replace(/\s+crossorigin(?:=["'][^"']*["'])?/gi, "")
      );
      out = out.replace(/<link\b[^>]*>/gi, (tag) => {
        if (!/\brel\s*=\s*["']stylesheet["']/i.test(tag)) return tag;
        if (!/\.\/assets\/[^"']+/.test(tag)) return tag;
        return tag.replace(/\s+crossorigin(?:=["'][^"']*["'])?/gi, "");
      });
      /** Tek IIFE paketi: `type="module"` olmadan yükle (Chrome file://). */
      out = out.replace(
        /<script\s+type=["']module["']\s+src=["'](\.\/assets\/arena-bundle\.js)["']\s*>\s*<\/script>/gi,
        '<script defer src="$1"></script>'
      );
      return out;
    },
  };
}

export default defineConfig({
  base: "./",
  server: { port: 5173, host: true, open: true },
  plugins: [stripCrossoriginFromBuiltHtml()],
  build: {
    /** Chrome `file://` ES modül yüklemez; tek IIFE + klasik `<script defer>` ile `dist/index.html` çalışır. */
    chunkSizeWarningLimit: 2500,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        format: "iife",
        name: "ArenaBattle",
        inlineDynamicImports: true,
        entryFileNames: "assets/arena-bundle.js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
