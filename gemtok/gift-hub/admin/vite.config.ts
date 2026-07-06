import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: __dirname,
  base: "/admin/",
  server: {
    port: 8788,
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/gift-images": "http://127.0.0.1:8787",
    },
  },
  build: {
    outDir: path.join(__dirname, "..", "public", "admin"),
    emptyOutDir: true,
  },
});
