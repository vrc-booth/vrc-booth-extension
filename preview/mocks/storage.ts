import type { AuthToken } from "@/components/review/types";
import { MOCK_TOKEN, PREVIEW_EVENT, setSignedIn, state } from "./state";

export const authTokenStorage = {
  getValue: async (): Promise<AuthToken | null> => state.signedIn ? { ...MOCK_TOKEN } : null,
  setValue: async (value: AuthToken | null) => { setSignedIn(Boolean(value)); },
  removeValue: async () => { setSignedIn(false); },
  watch: (callback: (value: AuthToken | null, previous: AuthToken | null) => void) => {
    let previous = state.signedIn ? { ...MOCK_TOKEN } : null;
    const listener = () => {
      const next = state.signedIn ? { ...MOCK_TOKEN } : null;
      callback(next, previous);
      previous = next;
    };
    window.addEventListener(PREVIEW_EVENT, listener);
    return () => window.removeEventListener(PREVIEW_EVENT, listener);
  },
};
