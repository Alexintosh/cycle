import { fileURLToPath, URL } from "node:url"
import { VitePWA } from "vite-plugin-pwa"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "/",
  plugins: [react(), VitePWA({
    registerType: "prompt",
    includeAssets: ["icons/*.png"],
    manifest: {
      id: "./", name: "Cycle", short_name: "Cycle",
      description: "Your rituals and recurring life, online and offline.",
      start_url: "./", scope: "./", display: "standalone",
      background_color: "#f8fafc", theme_color: "#082044", lang: "en",
      icons: [
        { src: "icons/cycle-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "icons/cycle-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
      ],
    },
    workbox: {
      globPatterns: ["**/*.{js,css,html,png,webmanifest}"],
      navigateFallbackDenylist: [/\/api(?:\/|$)/],
      cleanupOutdatedCaches: true,
    },
  })],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    host: "localhost",
    port: 3100,
    strictPort: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
  },
})
