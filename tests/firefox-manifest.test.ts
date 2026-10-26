import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ConfigEnv, UserManifest } from "wxt";
import config, { FIREFOX_TEST_GECKO_ID } from "../wxt.config";

const manifestFor = async (browser: string, mode: string) => {
  const manifest = config.manifest as (env: ConfigEnv) => UserManifest | Promise<UserManifest>;
  return manifest({ browser, mode, command: mode === "development" ? "serve" : "build", manifestVersion: browser === "firefox" ? 2 : 3 });
};

// Mirrors Firefox identity.getRedirectURL(): SHA-1 of the add-on ID under extensions.allizom.org.
const firefoxRedirectUrl = (id: string) => `https://${createHash("sha1").update(id).digest("hex")}.extensions.allizom.org/`;

describe("Firefox manifest identity", () => {
  it("pins the test Gecko ID in Firefox development builds", async () => {
    const manifest = await manifestFor("firefox", "development");
    expect(manifest.browser_specific_settings).toEqual({ gecko: { id: "ribe@ribe.io" } });
    expect(firefoxRedirectUrl(FIREFOX_TEST_GECKO_ID))
      .toBe("https://d75f1d80d55cc7c6b40121faf9b7ad4c9937d5f6.extensions.allizom.org/");
  });

  it("leaves the release Gecko ID unset in Firefox production builds", async () => {
    expect((await manifestFor("firefox", "production")).browser_specific_settings).toBeUndefined();
  });

  it("never adds Gecko settings to Chrome builds", async () => {
    for (const mode of ["development", "production"]) {
      const manifest = await manifestFor("chrome", mode);
      expect(manifest.browser_specific_settings).toBeUndefined();
      expect(manifest.key).toBeTruthy();
    }
  });
});
