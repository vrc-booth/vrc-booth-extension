import { delay, setSignedIn } from "./state";

export const loginWithDiscord = async (): Promise<void> => {
  await delay();
  setSignedIn(true);
};
