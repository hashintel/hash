/**
 * Evidence resolver: selection → highlighted block IDs + target page.
 *
 * Pure functions. No I/O, no React.
 */
import type {
  AssertionWindow,
  Block,
  ExtractedClaim,
  MentionContextPlan,
} from "./types";

// ---------------------------------------------------------------------------
// Selection types
// ---------------------------------------------------------------------------

export type Selection =
  | { kind: "claim"; claim: ExtractedClaim }
  | { kind: "assertion"; window: AssertionWindow }
  | null;

// ---------------------------------------------------------------------------
// Evidence resolution
// ---------------------------------------------------------------------------

export interface EvidenceResult {
  blockIds: string[];
  targetPage: number | null;
}

export function resolveEvidence(
  selection: Selection,
  blocks: Block[],
): EvidenceResult {
  if (!selection) {
    return { blockIds: [], targetPage: null };
  }

  const blockIds =
    selection.kind === "claim"
      ? [
          ...new Set(
            selection.claim.evidenceRefs.flatMap((ref) => ref.blockIds),
          ),
        ]
      : [selection.window.blockId];

  let targetPage: number | null = null;
  for (const block of blocks) {
    if (!blockIds.includes(block.blockId)) {
      continue;
    }
    for (const anchor of block.anchors) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Anchor union may expand
      if (anchor.kind === "file_page_bbox") {
        if (targetPage === null || anchor.page < targetPage) {
          targetPage = anchor.page;
        }
      }
    }
  }

  return { blockIds, targetPage };
}

// ---------------------------------------------------------------------------
// Assertion window collection per entity
// ---------------------------------------------------------------------------

/**
 * Pre-compute a map of rosterEntryId → AssertionWindow[] for all entities.
 */
export function buildEntityAssertionMap(
  mentionContexts: MentionContextPlan[],
): Map<string, AssertionWindow[]> {
  const map = new Map<string, AssertionWindow[]>();

  for (const context of mentionContexts) {
    if (context.mode !== "assertion_windows") {
      continue;
    }
    for (const win of context.assertionWindows) {
      for (const participant of win.participants) {
        const existing = map.get(participant.rosterEntryId) ?? [];
        existing.push(win);
        map.set(participant.rosterEntryId, existing);
      }
    }
  }

  return map;
}
