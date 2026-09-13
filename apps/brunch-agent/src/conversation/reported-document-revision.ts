import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";

/**
 * Petrinaut revision reported for one admitted browser submission.
 *
 * This is ephemeral live reconciliation input, not conversation history or a
 * provenance store. Flue remains canonical for what the model observed.
 */
const registryKey = Symbol.for(
  "@apps/brunch-agent/reported-document-revisions-by-submission",
);

type ReportedDocumentRevisionRegistry = Map<string, string>;

const globalWithReportedDocumentRevisions = globalThis as typeof globalThis & {
  [registryKey]?: ReportedDocumentRevisionRegistry;
};

const revisionsBySubmissionId =
  globalWithReportedDocumentRevisions[registryKey] ?? new Map<string, string>();

globalWithReportedDocumentRevisions[registryKey] = revisionsBySubmissionId;

const submissionScope = new AsyncLocalStorage<string>();

export const reportDocumentRevision = (
  submissionId: string,
  revisionId: string,
): boolean => {
  if (revisionsBySubmissionId.has(submissionId)) return false;
  revisionsBySubmissionId.set(submissionId, revisionId);
  return true;
};

export const discardReportedDocumentRevision = (
  submissionId: string,
  revisionId: string,
): void => {
  if (revisionsBySubmissionId.get(submissionId) === revisionId)
    revisionsBySubmissionId.delete(submissionId);
};

/** Mirrors Flue 2.0.3's frozen keyed-submission wire derivation. */
export const reportedRevisionSubmissionId = (
  agentName: string,
  instanceId: string,
  idempotencyKey: string,
): string => {
  const preimage = `flue-submission-key\n${agentName}\n${instanceId}\n${idempotencyKey}`;
  return `sub_ik_${createHash("sha256").update(preimage).digest("hex").slice(0, 32)}`;
};

export const withReportedDocumentRevisionScope = <Value>(
  submissionId: string | undefined,
  run: () => Promise<Value>,
): Promise<Value> =>
  submissionId === undefined ? run() : submissionScope.run(submissionId, run);

export const takeReportedDocumentRevision = (): string | undefined => {
  const submissionId = submissionScope.getStore();
  if (submissionId === undefined) return undefined;
  const revisionId = revisionsBySubmissionId.get(submissionId);
  revisionsBySubmissionId.delete(submissionId);
  return revisionId;
};
