import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["voicebar_harness.test.ts"],
    passWithNoTests: false,
  },
});
