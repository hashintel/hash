import { isDwellType } from "./categories";

import type { SiteNode } from "./types";

export const STATUS_OPTIONS = [
  "Investigation started",
  "Investigation update",
  "Investigation concluded",
  "Rejected (infeasible)",
  "Rejected (data issue)",
] as const;

export type StatusOption = (typeof STATUS_OPTIONS)[number];

/** A single status update left against a step/node. */
export interface StatusEntry {
  /** ISO timestamp the status was saved (from the entity's creation edition). */
  at: string;
  /** Author display name, resolved server-side from edition provenance. */
  user: string;
  category: StatusOption;
  text: string;
}

/** Status history keyed by step/node + opportunity type. */
export type StatusStore = Record<string, StatusEntry[]>;

export type StatusActionTone = "neutral" | "success" | "danger";

export interface StatusActionState {
  label: "To action" | "Investigating" | "Investigated" | "Rejected";
  tone: StatusActionTone;
}

export function statusCommentRequired(category: StatusOption): boolean {
  return category !== "Investigation started";
}

/**
 * Stable key for status aggregation: site + opportunity type (dwell vs
 * planning, derived from the node) + node identity. Product IDs are included
 * only for post-QA dwell, where the same step ID needs product disambiguation.
 * It intentionally excludes time range and measure so status history remains
 * stable across filters.
 */
export function statusKey(siteId: string, node: SiteNode): string {
  const type = isDwellType(node.type) ? "dwell" : "planning";
  const nodeKey =
    node.type === "post_qa_ship"
      ? `${node.id}-${node.products.map((product) => product.id).join(",")}`
      : node.id;
  return [siteId, type, nodeKey].join("::");
}

export function deriveStatusActionState(
  entries: readonly StatusEntry[] | undefined,
): StatusActionState {
  if (!entries || entries.length === 0) {
    return { label: "To action", tone: "neutral" };
  }

  const latest = [...entries].sort((left, right) =>
    left.at.localeCompare(right.at),
  )[entries.length - 1];

  if (!latest) {
    return { label: "To action", tone: "neutral" };
  }

  if (latest.category.startsWith("Rejected")) {
    return { label: "Rejected", tone: "danger" };
  }

  if (latest.category === "Investigation concluded") {
    return { label: "Investigated", tone: "success" };
  }

  return { label: "Investigating", tone: "neutral" };
}
