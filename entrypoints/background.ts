import { onMessage } from '@/components/review/messaging';
import { refreshAccessToken, setAuthTokens } from '@/components/review/session';
import { browser } from 'wxt/browser';

export default defineBackground(() => {
    onMessage("getAuthRedirectUrl", () => browser.identity.getRedirectURL());
    onMessage("setAuthTokens", (message) => setAuthTokens(message.data));
    onMessage("openAccountSettings", async (message) => {
        const tabId = message.sender.tab?.id;
        if (tabId !== undefined && browser.sidePanel?.open) {
            try {
                await browser.sidePanel.open({ tabId });
                return;
            } catch {
                // Older browsers may not preserve the user gesture through messaging.
            }
        }
        await browser.tabs.create({ url: browser.runtime.getURL("/account.html") });
    });
    onMessage("refreshAccessToken", (message) => refreshAccessToken(message.data));
    onMessage('loginWithDiscord', async (message) => {
        const request = new URL(message.data);
        const expectedState = request.searchParams.get("state");
        const redirectUrl = browser.identity.getRedirectURL();
        if (!expectedState || request.searchParams.get("redirectUrl") !== redirectUrl) return null;

        const response = await browser.identity.launchWebAuthFlow({
            url: message.data,
            interactive: true,
        });
        if (!response) return null;
        try {
            const callback = new URL(response);
            const expected = new URL(redirectUrl);
            if (callback.origin !== expected.origin || callback.pathname !== expected.pathname
                || callback.searchParams.get("state") !== expectedState
                || callback.searchParams.has("error")) return null;
            return callback.searchParams.get("code");
        } catch {
            return null;
        }
    });
});
