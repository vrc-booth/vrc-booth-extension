import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)), "~": fileURLToPath(new URL("./", import.meta.url)), "#i18n": fileURLToPath(new URL("./.wxt/i18n/index.ts", import.meta.url)) } },
  test: { server: { deps: { inline: ["wxt"] } }, include: ["**/*.test.{ts,tsx}"], exclude: ["node_modules/**", "dist/**", ".output/**"] },
});
