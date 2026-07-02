/**
 * Coarse layer-kind mapping for the dev harness's GPU-cost bisection: hide
 * one kind at a time under a pinned-camera render bench and the fps delta
 * attributes the fill cost. Prefix matching covers Deck sublayers, whose
 * ids extend their parent's (`flat-entities-circle`, `cluster-labels-...`).
 */

export type LayerKind =
  | "dots"
  | "bubbles"
  | "edges"
  | "icons"
  | "labels"
  | "other";

/** Every kind the harness can toggle ("other" stays always-on: overlays, selection). */
export const TOGGLEABLE_LAYER_KINDS = [
  "dots",
  "bubbles",
  "edges",
  "icons",
  "labels",
] as const satisfies readonly LayerKind[];

const KIND_BY_PREFIX: readonly (readonly [string, LayerKind])[] = [
  ["flat-entities", "dots"],
  ["entities:", "dots"],
  ["flat-bubbles", "bubbles"],
  ["clusters", "bubbles"],
  ["flat-edges", "edges"],
  ["hierarchical-edges", "edges"],
  ["internal:", "edges"],
  ["fanout:", "edges"],
  ["edge-endpoint-arrows", "edges"],
  ["edge-lane-chevrons", "edges"],
  ["flat-type-icons", "icons"],
  ["cluster-labels", "labels"],
  ["edge-labels", "labels"],
];

export function layerKindOf(layerId: string): LayerKind {
  for (const [prefix, kind] of KIND_BY_PREFIX) {
    if (layerId.startsWith(prefix)) {
      return kind;
    }
  }
  return "other";
}
