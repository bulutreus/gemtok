import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [
    react(),
    dts({
      include: ["src"],
      outDir: "dist",
      rollupTypes: true,
      tsconfigPath: "tsconfig.json",
    }),
  ],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/index.ts"),
      name: "GemTokLive",
      formats: ["es"],
      fileName: () => "gemtok-live.js",
    },
    rollupOptions: {
      external: ["react", "react/jsx-runtime"],
      output: {
        globals: { react: "React" },
      },
    },
  },
});
