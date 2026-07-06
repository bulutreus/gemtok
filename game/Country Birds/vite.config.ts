import { defineConfig } from "vite";

const BUNDLE = "country-birds-bundle.js";

/**
 * `crossorigin` + `file://` veya bazı sunucularda stil / modül yüklemesi kesilir (beyaz ekran).
 * Modül satırını klasik `<script defer>` + tek IIFE paketine çeviririz (Arena Battle ile aynı mantık).
 */
function stripCrossoriginAndModuleScript() {
  return {
    name: "gemtok-country-birds-file-html",
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
      out = out.replace(
        new RegExp(
          `<script\\s+type=["']module["']\\s+src=["'](\\.\\/assets\\/${BUNDLE.replace(".", "\\.")})["']\\s*>\\s*<\\/script>`,
          "gi"
        ),
        '<script defer src="$1"></script>'
      );
      return out;
    },
  };
}

export default defineConfig({
  base: "./",
  server: {
    port: 5173,
  },
  plugins: [stripCrossoriginAndModuleScript()],
  build: {
    chunkSizeWarningLimit: 2500,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        format: "iife",
        name: "CountryBirds",
        inlineDynamicImports: true,
        entryFileNames: `assets/${BUNDLE}`,
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
