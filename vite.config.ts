import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    // Tailwind v4 uses a Vite plugin instead of a separate config file.
    // It picks up your @theme block + :root tokens from src/index.css.
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Lets every file write `import X from "@/components/..."` etc.
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5000,
    host: "0.0.0.0",
    allowedHosts: true,
    watch: {
      ignored: ["**/.cache/**", "**/.replit", "**/node_modules/**"],
    },
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
