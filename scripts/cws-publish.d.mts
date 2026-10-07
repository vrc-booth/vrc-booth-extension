export const ITEM_ID: string;
export const REPOSITORY: string;
export const APPROVAL_ENVIRONMENT: string;
export class PublicationError extends Error { code: string; constructor(code: string); }
export function assertActivation(env: Record<string, string | undefined>): void;
export function assertTagHistory(tags: string[], version: string, currentTag: string): void;
export function assertEnvironmentApproval(reviews: unknown): void;
export function executeRelease(options: any): Promise<{ action: string; reason: string }>;
