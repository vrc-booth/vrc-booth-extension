import { ApiError, readResponseText } from "@/utils/review-utils";
import { API_BASE } from "./config";
import { sendMessage } from "./messaging";
import { isAuthToken } from "./session";

export const loginWithDiscord = async (): Promise<void> => {
  const redirectUrl = await sendMessage("getAuthRedirectUrl", undefined);
  const parameters = new URLSearchParams({ redirectUrl, state: crypto.randomUUID() });
  const code = await sendMessage("loginWithDiscord", `${API_BASE}/auth/oauth/discord?${parameters}`);
  if (!code) throw new Error("Discord login was cancelled or returned an invalid callback");

  const callback = new URLSearchParams({ code, redirectUrl });
  const response = await fetch(`${API_BASE}/auth/oauth/discord/callback?${callback}`);
  if (!response.ok) throw new ApiError(await readResponseText(response), response.status);
  const tokens: unknown = await response.json();
  if (!isAuthToken(tokens)) throw new Error("Invalid authentication response");
  await sendMessage("setAuthTokens", tokens);
};
