import tailwindcss from "@tailwindcss/vite";
import { defineConfig, WxtViteConfig } from 'wxt';

// Permanent Gecko ID: Firefox derives the Discord OAuth redirect URL from it, and AMO never lets it change.
export const FIREFOX_GECKO_ID = "@boothplus.ribe";
// Kept outside the manifest literal because WXT's gecko type predates data_collection_permissions (Firefox 140+).
const FIREFOX_GECKO = {
  id: FIREFOX_GECKO_ID,
  strict_min_version: "140.0",
  data_collection_permissions: { required: ["authenticationInfo", "browsingActivity", "personalCommunications"] },
};

// See https://wxt.dev/api/config.html
export default defineConfig({
  vite: (): WxtViteConfig => ({
    plugins: [tailwindcss()],
  } as WxtViteConfig),
  modules: ['@wxt-dev/module-react', '@wxt-dev/i18n/module'],
  manifest: ({ browser }) => ({
    key: browser === "firefox" ? undefined : "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAp7FZB6bFp2sn1uhlBE8K8hYQHsLaAl622sNlZhC/JEnhpKLNpp1DXbbBLyENUheH/yEd5McB3BvOJBNYD2w+Z7BjGvvCcGpBRiOoI/MHyrwqcDKzCdTbu8IQXqcSp2s+JPJhHMYZCwK7kLPV/5aT0x1n2SuizagWNIPeAgNU4vh04OQUXvb6gs/sMLbgH/F8S9ZNU/gOo0A/JabvEBmiMM/KgCTP8tu6m9bNittSdkzWAsheYV3i0MYAv1frhfI/QfoRb4PlP3jf92t4/TRM0/XwFMsVzD8SFRX6fMX/lf3j1tH1LWGJfpHHD0yeOLHsEFAwjJ3pDZcuWsNiL6tENQIDAQAB",
    default_locale: "ko",
    permissions: browser === "firefox" ? ["identity", "storage"] : ["identity", "storage", "sidePanel"],
    host_permissions: [ "*://vbt.kamyu.me/api/**/*", "*://discord.com/**/*" ],
    browser_specific_settings: browser === "firefox" ? { gecko: FIREFOX_GECKO } : undefined,
  }),
  webExt: {
    startUrls: ["https://booth.pm/ko/items/6571299", "https://jingo1016.booth.pm/items/5058077"],
  },
  outDir: 'dist',
});
