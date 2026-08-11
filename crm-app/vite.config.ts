import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/",
  // /ops/secrets talks to secretsd (loopback only, owner-authenticated). In dev
  // the SPA and the API are on different ports, so proxy the one route rather
  // than teaching the page an absolute URL.
  server: {
    proxy: {
      "/api/secrets": {
        target: "http://127.0.0.1:8091",
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "מרכז נשמה — OPS",
        short_name: "מרכז נשמה",
        description: "מערכת התפעול של מרכז נשמה — תורמים, אנשי קשר, תורים ואוטומציות",
        theme_color: "#1a5f7a",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        dir: "rtl",
        lang: "he",
        icons: [
          {
            src: "icon.svg",
            sizes: "192x192 512x512",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "icon.svg",
            sizes: "192x192 512x512",
            type: "image/svg+xml",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
        navigateFallback: "/index.html",
      },
    }),
  ],
});
