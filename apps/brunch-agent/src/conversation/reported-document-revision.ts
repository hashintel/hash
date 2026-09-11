/**
 * Latest Petrinaut revision reported by an authorized browser request.
 *
 * This is ephemeral live reconciliation input, not conversation history or a
 * provenance store. Flue remains canonical for what the model observed.
 */
const registryKey = Symbol.for(
  "@apps/brunch-agent/reported-document-revisions",
);

type ReportedDocumentRevisionRegistry = Map<string, string>;

const globalWithReportedDocumentRevisions = globalThis as typeof globalThis & {
  [registryKey]?: ReportedDocumentRevisionRegistry;
};

const revisionsByInstanceId =
  globalWithReportedDocumentRevisions[registryKey] ?? new Map<string, string>();

globalWithReportedDocumentRevisions[registryKey] = revisionsByInstanceId;

export const reportDocumentRevision = (
  instanceId: string,
  revisionId: string,
): void => {
  revisionsByInstanceId.set(instanceId, revisionId);
};

export const takeReportedDocumentRevision = (
  instanceId: string,
): string | undefined => {
  const revisionId = revisionsByInstanceId.get(instanceId);
  revisionsByInstanceId.delete(instanceId);
  return revisionId;
};
