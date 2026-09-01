import { ARC_ID_PREFIX, ARC_ID_SEPARATOR } from "../arc-id";

/**
 * Selection types describe SDCPN entities the user might select, plus the
 * synthetic "arc" tag for arcs (which aren't first-class SDCPN entities — see
 * `core/arc-id.ts`).
 *
 * The *types* live in `/core` because they're SDCPN-shaped. The current
 * selection *state* (a `SelectionMap` held by the editor) lives in
 * `/react/state/editor-context`.
 */

/**
 * The selection vocabulary, as data. Hosts that validate selection coming from
 * outside the app (URL search params, an HTTP request) need the list at
 * runtime, and deriving the type from it keeps the two exhaustive by
 * construction.
 */
export const selectionItemTypes = [
  "place",
  "transition",
  "arc",
  "componentInstance",
  "type",
  "differentialEquation",
  "parameter",
] as const;

export type SelectionItemType = (typeof selectionItemTypes)[number];

export type SelectionItem =
  | { type: "place"; id: string }
  | { type: "transition"; id: string }
  | { type: "arc"; id: string }
  | { type: "componentInstance"; id: string }
  | { type: "type"; id: string }
  | { type: "differentialEquation"; id: string }
  | { type: "parameter"; id: string };

/** Map from item ID -> typed SelectionItem. O(1) lookup for ReactFlow bridge. */
export type SelectionMap = Map<string, SelectionItem>;

export type PanelTarget =
  | { kind: "none" }
  | { kind: "single"; item: SelectionItem }
  | { kind: "multi"; items: SelectionItem[] };

const selectionItemKey = (item: SelectionItem) => `${item.type}\0${item.id}`;

const compareCodeUnits = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

/**
 * Deduplicates and orders a selection, so equivalent selections compare and
 * serialize identically. Consumers rely on this being the one ordering: the
 * editor compares selections positionally, and hosts encode them into URLs.
 *
 * Ordering is by UTF-16 code unit rather than `localeCompare`, so a host that
 * canonicalizes on a server agrees with the browser. Collation is
 * locale-dependent and weights punctuation below letters, which would order
 * `place-b` and `placea` differently across runtimes.
 */
export const canonicalizeSelection = (
  selection: readonly SelectionItem[],
): readonly SelectionItem[] => {
  const unique = new Map<string, SelectionItem>();
  for (const item of selection) {
    unique.set(selectionItemKey(item), item);
  }
  return Array.from(unique.values()).sort(
    (left, right) =>
      compareCodeUnits(left.type, right.type) ||
      compareCodeUnits(left.id, right.id),
  );
};

export function parseArcId(
  arcId: string,
): { sourceId: string; targetId: string } | null {
  if (!arcId.startsWith(ARC_ID_PREFIX)) {
    return null;
  }
  const rest = arcId.slice(ARC_ID_PREFIX.length);
  const [sourceId, targetId] = rest.split(ARC_ID_SEPARATOR);
  if (!sourceId || !targetId) {
    return null;
  }
  return { sourceId, targetId };
}
