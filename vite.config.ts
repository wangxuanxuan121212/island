import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  base: "/island/",
  plugins: [react()],
  css: { postcss: { plugins: [] } },
  server: { port: 5186, strictPort: false },
  build: {
    rollupOptions: {
      input: {
        world: resolve(import.meta.dirname, "index.html"),
        editor: resolve(import.meta.dirname, "editor.html"),
      },
      output: {
        manualChunks: {
          three: ["three"],
          physics: ["@dimforge/rapier3d-compat"],
        },
      },
    },
  },
});
