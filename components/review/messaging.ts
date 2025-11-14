import { defineExtensionMessaging } from '@webext-core/messaging';

interface ProtocolMap {
  loginWithDiscord(url: string): string | null;
  openSidePanel(): void;
  closeSidePanel(): void;
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();