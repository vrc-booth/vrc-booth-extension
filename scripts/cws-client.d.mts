export type JournalPhase = "prepared" | "upload_started" | "upload_succeeded" | "upload_uncertain" |
  "submit_started" | "submitted" | "staged" | "promote_started" | "published" | "failed";
export type PublishType = "DEFAULT_PUBLISH" | "STAGED_PUBLISH";
export interface CandidateIdentity {
  version: string; commit: string; sha256: string; itemId: string;
  artifactId: string | number; runId: string | number;
}
export interface JournalRecord extends Omit<CandidateIdentity, "artifactId" | "runId"> {
  id: string; artifactId: string; runId: string; phase: JournalPhase;
}
export interface ItemRevisionStatus {
  state: string;
  distributionChannels?: Array<{ crxVersion: string; deployPercentage?: number }>;
}
export interface CwsStatus {
  name: string; itemId: string; publicKey?: string;
  publishedItemRevisionStatus?: ItemRevisionStatus;
  submittedItemRevisionStatus?: ItemRevisionStatus;
  lastAsyncUploadState?: string; takenDown?: boolean; warned?: boolean;
}
export interface CwsUploadResult {
  name: string; itemId: string; uploadState: string; crxVersion?: string;
}
export interface CwsPublishResult {
  name: string; itemId: string; state: string;
  warningInfo?: { warnings?: Array<{ reason: string; description: string }> };
}
export class TransportError extends Error {
  code: string; uncertain: boolean; status?: number;
  constructor(code: string, options?: { uncertain?: boolean; status?: number });
}
export class CwsClient {
  constructor(options: { publisherId: string; itemId: string; accessToken: string; fetchImpl?: typeof fetch; timeoutMs?: number });
  fetchStatus(): Promise<CwsStatus>;
  upload(zipBytes: Uint8Array): Promise<CwsUploadResult>;
  publish(publishType: PublishType): Promise<CwsPublishResult>;
}
export class GithubJournal {
  constructor(options: { repository: string; token: string; itemId: string; fetchImpl?: typeof fetch; timeoutMs?: number });
  list(): Promise<JournalRecord[]>;
  listReleaseVersions(): Promise<string[]>;
  reserve(candidate: CandidateIdentity): Promise<JournalRecord>;
  record(id: string | number, phase: JournalPhase): Promise<JournalRecord>;
}
