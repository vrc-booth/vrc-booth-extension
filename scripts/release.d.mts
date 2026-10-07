export const QA_SCENARIOS: string[];
export function releaseMetadata(pkg: { name: string; version: string }): {
  version: string; tag: string; chrome: string; firefox: string; sources: string;
};
export function validateQaRecord<T>(record: T, candidate: { version: string; commit: string }): T;
