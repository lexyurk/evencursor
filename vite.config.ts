import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist-hub"
  },
  server: {
    port: 5173
  }
});
