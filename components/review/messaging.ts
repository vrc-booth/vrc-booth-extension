import { defineExtensionMessaging } from '@webext-core/messaging';

interface ProtocolMap {
  loginWithDiscord(url: string): string | null;
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();