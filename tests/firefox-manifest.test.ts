import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ConfigEnv, UserManifest } from "wxt";
import config, { FIREFOX_GECKO_ID } from "../wxt.config";

const manifestFor = async (browser: string, mode: string) => {
  const manifest = config.manifest as (env: ConfigEnv) => UserManifest | Promise<UserManifest>;
  return manifest({ browser, mode, command: mode === "development" ? "serve" : "build", manifestVersion: browser === "firefox" ? 2 : 3 });
};

// Mirrors Firefox identity.getRedirectURL(): SHA-1 of the add-on ID under extensions.allizom.org.
const firefoxRedirectUrl = (id: string) => `https://${createHash("sha1").update(id).digest("hex")}.extensions.allizom.org/`;

describe("Firefox manifest identity", () => {
  it("pins the same Gecko ID and data-collection disclosure in every Firefox build", async () => {
    for (const mode of ["development", "production"]) {
      const manifest = await manifestFor("firefox", mode);
      expect(manifest.browser_specific_settings).toEqual({
        gecko: {
          id: "@boothplus.ribe",
          strict_min_version: "140.0",
          data_collection_permissions: { required: ["authenticationInfo", "browsingActivity", "personalCommunications"] },
        },
      });
    }
    expect(firefoxRedirectUrl(FIREFOX_GECKO_ID))
      .toBe("https://b475ff88666ec2af067c43d77ddaa1fb51507536.extensions.allizom.org/");
  });

  it("never adds Gecko settings to Chrome builds", async () => {
    for (const mode of ["development", "production"]) {
      const manifest = await manifestFor("chrome", mode);
      expect(manifest.browser_specific_settings).toBeUndefined();
      expect(manifest.key).toBeTruthy();
    }
  });
});
