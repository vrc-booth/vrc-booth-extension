import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ConfigEnv, UserManifest } from "wxt";
import config from "../wxt.config";

const require = createRequire(import.meta.url);
const localeRequire = createRequire(require.resolve("@wxt-dev/i18n"));
const { parseYAML } = localeRequire("confbox") as { parseYAML: (value: string) => Record<string, unknown> };
const locale = (name: string) => parseYAML(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), `../locales/${name}.yml`), "utf8"));

describe("extension description", () => {
  it("uses the localized description in every browser manifest", async () => {
    const manifest = config.manifest as (env: ConfigEnv) => UserManifest | Promise<UserManifest>;
    for (const browser of ["chrome", "firefox"]) {
      const result = await manifest({ browser, mode: "production", command: "build", manifestVersion: browser === "firefox" ? 2 : 3 });
      expect(result.description).toBe("__MSG_extDescription__");
    }
  });

  it("defines a store-sized description for every locale", () => {
    for (const name of ["ko", "en", "ja"]) {
      const description = locale(name).extDescription;
      expect(typeof description).toBe("string");
      // Chrome rejects manifest descriptions longer than 132 characters.
      expect((description as string).length).toBeGreaterThan(0);
      expect((description as string).length).toBeLessThanOrEqual(132);
      expect(description).not.toContain("manifest.json description");
    }
  });
});
