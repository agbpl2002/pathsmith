import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// I reuse Tauri's host override so the dev server works both inside and outside the desktop shell.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    // I keep Vite on a fixed port because Tauri points to this exact address in development.
    port: 1420,
    strictPort: true,
    host: host || "0.0.0.0",
    hmr: host
      ? {
          // I pin HMR to a predictable websocket port so Tauri can reconnect reliably.
          protocol: "ws",
          host,
          port: 1421
        }
      : undefined,
    watch: {
      // I ignore Rust-side changes here because Tauri watches that tree independently.
      ignored: ["**/src-tauri/**"]
    }
  }
});
