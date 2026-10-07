import { ACCOUNT_EVENT, setSignedIn } from "./state";

export async function sendMessage(name: string, payload?: unknown): Promise<any> {
  if (name === "openAccountSettings") {
    window.dispatchEvent(new Event(ACCOUNT_EVENT));
    return;
  }
  if (name === "loginWithDiscord") return "synthetic-oauth-code";
  if (name === "setAuthTokens") { setSignedIn(Boolean(payload)); return; }
  if (name === "refreshAccessToken") return false;
  if (name === "logout") { setSignedIn(false); return; }
  throw new Error(`Unsupported local preview message: ${name}`);
}
export const onMessage = () => () => undefined;
