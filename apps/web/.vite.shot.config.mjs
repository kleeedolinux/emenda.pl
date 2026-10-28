import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
const t = { target: "https://emenda.online", changeOrigin: true, secure: true };
export default { plugins: [react(), tailwindcss()], resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } }, server: { port: 5199, proxy: { "/api": t, "/data": t } } };
