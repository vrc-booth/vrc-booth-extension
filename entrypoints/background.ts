import { onMessage } from '@/components/review/messaging';
import { browser } from 'wxt/browser';

export default defineBackground(() => {
    onMessage('loginWithDiscord', async (message) => {
        const response = await browser.identity.launchWebAuthFlow({
          url: message.data,
          interactive: true,
        });

        try {
            return new URL(response!).searchParams.get('code');
        } catch (e) {
            return null;
        }
    });
});