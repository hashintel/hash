import type {
  CaptureStore,
  CaptureStoreSnapshot,
} from "@hashintel/brunch-agent";

/**
 * Recover only active-session Flue entry identities from already anchored
 * captures. The archive pointer's host-session identity is part of the key;
 * bare substrate ids are not globally unique across conversations.
 */
export const capturedUserEntryIdsForSession = async (
  store: Pick<CaptureStore, "readArchivedEntries">,
  snapshot: CaptureStoreSnapshot,
  sessionId: string,
): Promise<ReadonlySet<string>> => {
  const entryIds = new Set<string>();
  const archiveReads = snapshot.captures.flatMap((capture) =>
    "evidence" in capture
      ? capture.evidence
          .filter((evidence) => evidence.pointer.sessionId === sessionId)
          .map((evidence) => store.readArchivedEntries(evidence.pointer))
      : [],
  );
  for (const archivedEntries of await Promise.all(archiveReads)) {
    for (const entry of archivedEntries) {
      if (entry.versions.at(-1)?.kind === "user-affordance-payload") {
        entryIds.add(entry.substrateEntryId);
      }
    }
  }
  return entryIds;
};
