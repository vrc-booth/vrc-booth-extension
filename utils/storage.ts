import { AuthToken } from "@/components/review/types";
import { storage } from "wxt/utils/storage";

export const authTokenStorage = storage.defineItem<AuthToken | null>(
    'local:authToken',
    { fallback: null },
);