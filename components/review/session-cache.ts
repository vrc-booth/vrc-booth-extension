import type { QueryClient } from "@tanstack/react-query";
import { authTokenStorage } from "@/utils/storage";
import type { AuthToken } from "./types";

const privateQueries = new Set(["userProfile", "myComment", "myComments"]);
const observedSessions = new WeakMap<QueryClient, string | null>();
const generation = (tokens: AuthToken | null): string | null => tokens ? (tokens.sessionId ?? "legacy") : null;

// Storage events cover mounted roots; the initial read also reconciles changes
// made while a BOOTH root was absent but its shared QueryClient survived.
export const watchAuthSessionCache = (client: QueryClient): (() => void) => {
  let stopped = false;
  let events = 0;
  const reconcile = (next: AuthToken | null, previous?: AuthToken | null) => {
    const current = generation(next);
    const known = observedSessions.has(client) || previous !== undefined;
    const before = observedSessions.has(client) ? observedSessions.get(client) : generation(previous ?? null);
    observedSessions.set(client, current);
    if (known && before !== current) {
      void client.resetQueries({ predicate: (query) => privateQueries.has(String(query.queryKey[0])) }).catch(() => undefined);
    }
  };
  const unsubscribe = authTokenStorage.watch((next, previous) => {
    events++;
    if (!stopped) reconcile(next, previous);
  });
  void authTokenStorage.getValue().then((tokens) => {
    if (!stopped && events === 0) reconcile(tokens);
  }).catch(() => undefined);
  return () => { stopped = true; unsubscribe(); };
};
