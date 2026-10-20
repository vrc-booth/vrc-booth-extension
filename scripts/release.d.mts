export const QA_SCENARIOS: string[];
export const CHROME_QA_SCENARIOS: string[];
export const CHROME_ID: string;
export const CHROME_REDIRECT: string;
export function releaseMetadata(pkg: { name: string; version: string }): {
  version: string; tag: string; chrome: string; firefox: string; sources: string;
};
export function validateQaRecord<T>(record: T, candidate: { version: string; commit: string; browsers?: ("chrome" | "firefox")[] }): T;
export function validateChromeQaRecord<T>(record: T, candidate: { version: string; commit: string }): T;
