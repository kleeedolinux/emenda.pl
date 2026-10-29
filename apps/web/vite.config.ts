import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// Em dev, /api e /data vão para o Worker local (wrangler dev :8787).
// EMENDA_PROXY=https://emenda.online usa os dados de produção sem Worker local.
const proxyAlvo = process.env.EMENDA_PROXY || "http://127.0.0.1:8787";
const proxy = { target: proxyAlvo, changeOrigin: true };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // "^/api/" (não "/api"): a página /api é do SPA; só as chamadas /api/... vão ao Worker.
  server: { proxy: { "^/api/": proxy, "/data": proxy, "/v1": proxy } },
  build: {
    target: "es2022",
    cssCodeSplit: true,
    sourcemap: false,
    rolldownOptions: {
      output: {
        // Vendors estáveis em chunks próprios: cache longo entre deploys e main enxuto.
        codeSplitting: {
          groups: [
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 30 },
            { name: "router", test: /node_modules[\\/](react-router|@remix-run|cookie|set-cookie-parser)[\\/]/, priority: 25 },
            { name: "query", test: /node_modules[\\/]@tanstack[\\/]/, priority: 25 },
            { name: "motion", test: /node_modules[\\/](motion|framer-motion|motion-dom|motion-utils)[\\/]/, priority: 25 },
            { name: "d3", test: /node_modules[\\/](d3-[a-z-]+|internmap|delaunator|robust-predicates|topojson-client)[\\/]/, priority: 20 },
            { name: "radix", test: /node_modules[\\/](@radix-ui|@floating-ui|react-remove-scroll|react-remove-scroll-bar|react-style-singleton|use-callback-ref|use-sidecar|aria-hidden|get-nonce|tslib)[\\/]/, priority: 20 },
          ],
        },
      },
    },
  },
});
