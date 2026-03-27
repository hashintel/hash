import type { ExtractedClaim } from "./types";

export const groupClaimsByEntity = (
  claims: ExtractedClaim[],
): Map<string, ExtractedClaim[]> => {
  const map = new Map<string, ExtractedClaim[]>();

  for (const claim of claims) {
    const rosterEntryIds = claim.linkedRosterEntryIds ?? [claim.rosterEntryId];

    for (const rosterEntryId of new Set(rosterEntryIds)) {
      const existing = map.get(rosterEntryId) ?? [];
      existing.push(claim);
      map.set(rosterEntryId, existing);
    }
  }

  return map;
};
