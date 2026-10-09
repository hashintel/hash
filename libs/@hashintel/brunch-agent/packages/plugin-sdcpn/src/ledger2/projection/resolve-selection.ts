import type { AddressEntry } from "./project-ledger";
import type { ClaimRecord } from "./records";

/**
 * Parked commenting-flow design: resolving a selection in the rendered view
 * back to its record, and translating feedback into route-encoded ledger
 * operations. Nothing mounts this yet.
 */

export interface ResolvedRecord {
  address: string;
  recordType: "entity" | "claim";
  snippet: string;
}

const normalize = (text: string) =>
  text.toLowerCase().replaceAll(/\s+/gu, " ").trim();

/**
 * The projection is the re-anchoring oracle: every rendered span derives from
 * one record, so matching the selection against record snippets recovers the
 * address regardless of DOM-anchor drift.
 */
export const resolveSelection = (
  entries: AddressEntry[],
  originalText: string,
): ResolvedRecord[] => {
  const selection = normalize(originalText);
  if (selection.length === 0) return [];
  const matches: { resolved: ResolvedRecord; overlap: number }[] = [];
  for (const entry of entries)
    for (const snippet of entry.snippets) {
      const candidate = normalize(snippet);
      const overlap = candidate.includes(selection)
        ? selection.length
        : selection.includes(candidate)
          ? candidate.length
          : 0;
      if (overlap > 0)
        matches.push({
          resolved: {
            address: entry.address,
            recordType: entry.recordType,
            snippet,
          },
          overlap,
        });
    }
  return matches
    .sort((first, second) => second.overlap - first.overlap)
    .map(({ resolved }) => resolved);
};

/** A ledger operation in the route encoding, displayed as the tuple it is. */
export interface LedgerOp {
  route: string;
  payload: Record<string, unknown>;
  rationale: string;
}

export const opForFeedback = (
  resolved: ResolvedRecord,
  commentText: string,
): LedgerOp =>
  resolved.recordType === "claim"
    ? {
        route: "claim/create",
        payload: {
          text: commentText,
          supersedes: [resolved.address],
          origin: "stated",
          status: "confirmed",
        },
        rationale: `Correction of ${resolved.address}: a new claim supersedes it; the earlier record stays in the Ledger.`,
      }
    : {
        route: `entity/update/${resolved.address}`,
        payload: { note: commentText },
        rationale: `Feedback on ${resolved.address}: an entity update addressed in the route, replacing every field.`,
      };

export const opForAnswer = (
  claim: ClaimRecord,
  answerText: string,
): LedgerOp => ({
  route: "claim/create",
  payload: {
    text: answerText,
    entities: claim.entities,
    supersedes: [claim.address],
    origin: "stated",
    status: "confirmed",
  },
  rationale: `Answer settles ${claim.address} (${claim.status}): a confirmed claim supersedes it.`,
});
