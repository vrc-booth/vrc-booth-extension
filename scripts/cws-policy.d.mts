export type VersionTuple = [number, number, number, number];
export type ReleaseStage = "prepare" | "submit" | "promote";
export type HistoryPhase = "prepared" | "upload_started" | "upload_succeeded" | "upload_uncertain" | "submit_started" | "submitted" | "staged" | "promote_started" | "published" | "failed";
export interface Candidate {
  version: string;
  commit: string;
  sha256: string;
  itemId: string;
}
export interface HistoryRecord extends Candidate {
  phase: HistoryPhase;
  [key: string]: unknown;
}
export interface DistributionChannel {
  crxVersion: string;
  deployPercentage?: number;
}
export interface ItemRevisionStatus {
  state: "ITEM_STATE_UNSPECIFIED" | "PENDING_REVIEW" | "STAGED" | "PUBLISHED" | "PUBLISHED_TO_TESTERS" | "REJECTED" | "CANCELLED";
  distributionChannels: DistributionChannel[];
}
export interface FetchStatus {
  name: string;
  itemId: string;
  publishedItemRevisionStatus?: ItemRevisionStatus;
  submittedItemRevisionStatus?: ItemRevisionStatus;
  lastAsyncUploadState?: "UPLOAD_STATE_UNSPECIFIED" | "SUCCEEDED" | "IN_PROGRESS" | "FAILED" | "NOT_FOUND";
  takenDown?: boolean;
  warned?: boolean;
  [key: string]: unknown;
}
export interface CwsPlan {
  action: "upload" | "wait" | "already_done" | "promote";
  reason: string;
}
export class CwsPolicyError extends Error {
  code: string;
  constructor(code: string, message: string);
}
export const HISTORY_PHASES: readonly HistoryPhase[];
export function parseCandidateVersion(value: unknown): VersionTuple;
export function parseStoreVersion(value: unknown): VersionTuple;
export function compareVersions(a: string, b: string): -1 | 0 | 1;
export function assertReleaseIdentity<T extends Candidate>(input: {
  stage: ReleaseStage;
  candidate: T;
  packageVersion: string;
  manifestVersion: string;
  tag: string;
  tagCommit: string | null;
}): T;
/** The caller must authenticate and completely retrieve history before setting historyTrusted. */
export function planCwsRelease(input: {
  stage: "submit" | "promote";
  candidate: Candidate;
  status: FetchStatus;
  history: HistoryRecord[];
  historyTrusted: boolean;
  /** Complete release history, with canonical numeric tags validated and an optional v removed. */
  releaseVersions?: string[];
}): CwsPlan;
