import type { AuthToken } from "./types";
import { defineExtensionMessaging } from '@webext-core/messaging';

interface ProtocolMap {
  getAuthRedirectUrl(): string;
  setAuthTokens(tokens: AuthToken | null): void;
  openAccountSettings(): void;
  refreshAccessToken(failed: Pick<AuthToken, "accessToken" | "sessionId">): boolean;
  loginWithDiscord(url: string): string | null;
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();