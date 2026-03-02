import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      obsidian: resolve(__dirname, "test/__mocks__/obsidian.ts"),
    },
  },
  define: {
    __DROPBOX_APP_KEY__: JSON.stringify(""),
  },
  test: {
    globals: true,
    environment: "node",
  },
});
