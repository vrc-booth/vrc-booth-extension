import { ApiError, readResponseText } from "@/utils/review-utils";
import { authTokenStorage } from "@/utils/storage";
import { browser } from "wxt/browser";
import { API_BASE } from "./api";
import { sendMessage } from "./messaging";
import type { AuthToken } from "./types";

/**
 * 디스코드 OAuth 창을 띄우고 발급받은 토큰을 저장한다. 리뷰 보드와 구매 CTA가
 * 같은 로그인 경로를 쓰도록 한 곳에 모아 둔다. 호출한 쪽에서 로그인 후 필요한
 * 쿼리를 다시 불러와야 한다.
 */
export const loginWithDiscord = async (): Promise<void> => {
  const redirectUrl = `https://${browser.runtime.id}.chromiumapp.org/`;
  const authUrl = `${API_BASE}/auth/oauth/discord?redirectUrl=${redirectUrl}`;
  const code = await sendMessage("loginWithDiscord", authUrl);
  const response = await fetch(
    `${API_BASE}/auth/oauth/discord/callback?code=${code}&redirectUrl=${redirectUrl}`,
  );

  if (!response.ok) {
    throw new ApiError(await readResponseText(response), response.status);
  }

  const authToken: AuthToken = await response.json();
  await authTokenStorage.setValue(authToken);
};
