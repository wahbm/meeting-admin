import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { normalizeBasePath } from "./shared/public-path";
export default defineConfig({
  base: normalizeBasePath(process.env.PUBLIC_BASE_PATH),
  plugins: [react()],
  server: {
    proxy: { "/api": { target: "http://127.0.0.1:3001", changeOrigin: false } },
  },
});
