import type { CaptureStore, CaptureStoreSnapshot } from "@brunch/core";

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
  for (const capture of snapshot.captures) {
    if (!("evidence" in capture)) continue;
    for (const evidence of capture.evidence) {
      if (evidence.pointer.sessionId !== sessionId) continue;
      for (const entry of await store.readArchivedEntries(evidence.pointer)) {
        if (entry.versions.at(-1)?.kind === "user-affordance-payload") {
          entryIds.add(entry.substrateEntryId);
        }
      }
    }
  }
  return entryIds;
};
