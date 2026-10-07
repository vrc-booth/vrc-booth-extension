import tailwindcss from "@tailwindcss/vite";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Reuse the YAML parser already installed for WXT's locale tooling.
const require = createRequire(import.meta.url);
const localeRequire = createRequire(require.resolve("@wxt-dev/i18n"));
const { parseYAML } = localeRequire("confbox") as {
  parseYAML: (source: string) => unknown;
};
const projectRoot = dirname(fileURLToPath(import.meta.url));
const mock = (name: string) => resolve(projectRoot, "preview/mocks", name);

export default {
  root: resolve(projectRoot, "preview"),
  plugins: [
    tailwindcss(),
    {
      name: "preview-locales",
      transform(source: string, id: string) {
        if (/\/locales\/[^/]+\.yml$/.test(id)) {
          return { code: `export default ${JSON.stringify(parseYAML(source))};`, map: null };
        }
      },
    },
  ],
  resolve: {
    alias: [
      { find: "@/components/review/api", replacement: mock("api.ts") },
      { find: "@/components/review/auth", replacement: mock("auth.ts") },
      { find: "@/components/review/messaging", replacement: mock("messaging.ts") },
      { find: "@/utils/storage", replacement: mock("storage.ts") },
      { find: "#i18n", replacement: mock("i18n.ts") },
      { find: "wxt/browser", replacement: mock("browser.ts") },
      { find: "@", replacement: projectRoot },
    ],
  },
  esbuild: { jsx: "automatic" },
  server: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
    fs: { allow: [projectRoot] },
  },
  build: {
    outDir: resolve(projectRoot, "preview/dist"),
    emptyOutDir: true,
  },
};
