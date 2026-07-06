import { isDwellType, isProductSpecificType } from "./categories";

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
  /** ISO timestamp the status was first created (original decision time). */
  at: string;
  /** Author display name, resolved from the status entity's original creator. */
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

export type StatusActionLabel = StatusActionState["label"];

/** Status buckets in their canonical (custom) order. */
export const STATUS_LABELS_IN_ORDER: StatusActionLabel[] = [
  "To action",
  "Investigating",
  "Investigated",
  "Rejected",
];

/**
 * Sort/filter rank of each status bucket.
 */
const STATUS_RANK: Record<StatusActionLabel, number> = Object.fromEntries(
  STATUS_LABELS_IN_ORDER.map((label, index) => [label, index]),
) as Record<StatusActionLabel, number>;

/** Custom-order comparator (asc) for two status bucket labels. */
export function compareStatusLabels(
  left: StatusActionLabel,
  right: StatusActionLabel,
): number {
  return STATUS_RANK[left] - STATUS_RANK[right];
}

export function statusCommentRequired(category: StatusOption): boolean {
  return category !== "Investigation started";
}

/**
 * Stable key for status aggregation: site + opportunity type (dwell vs
 * planning, derived from the node) + node identity.
 *
 * Product IDs are appended only for product-specific step types (the
 * finished-good leg from QA onward: `qa_hold`, `post_qa_ship`, `transit`,
 * `destination_dwell`), whose `node.id` is *location*-scoped (plant/hub/lane)
 * and so needs finished-good disambiguation -- these are deduplicated per
 * finished good, so exactly one product is appended and the key stays stable.
 * The product ids are sorted before joining so the key stays deterministic even
 * if that single-product invariant is ever relaxed to multiple products.
 *
 * Every other step type keys on `node.id` alone because its subject is already
 * in the id: procurement on the procured item (`procurement_<item>`), raw &
 * intermediate dwell on the material dwelling (`*_dwell_<material>`), and
 * production on the produced thing (`prod_duration_<good>`). These do not
 * incorporate the (potentially many) products flowing through them, so the key
 * stays stable as product membership changes.
 *
 * It intentionally excludes time range and measure so status history remains
 * stable across filters.
 */
export function statusKey(siteId: string, node: SiteNode): string {
  const type = isDwellType(node.type) ? "dwell" : "planning";
  const nodeKey = isProductSpecificType(node.type)
    ? `${node.id}-${node.products
        .map((product) => product.id)
        .sort()
        .join(",")}`
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

/** The status bucket label for a node, resolved from its status history. */
export function statusLabelForNode(
  siteId: string,
  node: SiteNode,
  statusHistory: StatusStore,
): StatusActionLabel {
  return deriveStatusActionState(statusHistory[statusKey(siteId, node)]).label;
}
