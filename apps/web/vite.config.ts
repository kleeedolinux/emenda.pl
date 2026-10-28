import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// Em dev, /api e /data vão para o Worker local (wrangler dev :8787).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: { proxy: { "/api": "http://127.0.0.1:8787", "/data": "http://127.0.0.1:8787" } },
  build: { target: "es2022", cssCodeSplit: true, sourcemap: false },
});
