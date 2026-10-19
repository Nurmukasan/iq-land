import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) =>
          id.includes("/shared/i18n/catalog.json") ? "translations" : undefined,
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        // Keep Host aligned with the browser Origin for the API's CSRF check.
        changeOrigin: false,
      },
    },
  },
});
