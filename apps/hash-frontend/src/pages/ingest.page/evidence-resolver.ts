/**
 * Evidence resolver: selection → highlighted block IDs + target page.
 *
 * Pure function. No I/O, no React.
 */
import type { Block, ExtractedClaim, RosterEntry } from "./types";

export type Selection =
  | { kind: "roster"; entry: RosterEntry }
  | { kind: "claim"; claim: ExtractedClaim }
  | null;

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
    selection.kind === "roster"
      ? [...new Set(selection.entry.mentions.map((mention) => mention.blockId))]
      : [
          ...new Set(
            selection.claim.evidenceRefs.flatMap((ref) => ref.blockIds),
          ),
        ];

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
