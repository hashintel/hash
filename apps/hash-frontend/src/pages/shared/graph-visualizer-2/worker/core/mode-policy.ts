import type { VizConfig } from "../../config";
import type { VizMode } from "../../ids";

/**
 * The rendering-regime state machine: which tier (flat-force,
 * community-force, hierarchical-lod) should be active for a given node count.
 *
 * Transitions are hysteretic: the exit threshold upward (`*ExitNodes`) is
 * higher than the re-entry threshold downward (`*MaxNodes`), so a graph
 * hovering around a boundary doesn't flip-flop between regimes on every
 * ingest batch.
 */
export function nextVizMode(
  mode: VizMode,
  nodeCount: number,
  config: VizConfig,
): VizMode {
  if (mode === "flat-force" && nodeCount > config.flatLayoutExitNodes) {
    return nodeCount > config.communityColorExitNodes
      ? "hierarchical-lod"
      : "community-force";
  }

  if (
    mode === "community-force" &&
    nodeCount > config.communityColorExitNodes
  ) {
    return "hierarchical-lod";
  }

  if (mode === "community-force" && nodeCount < config.flatLayoutMaxNodes) {
    return "flat-force";
  }

  if (
    mode === "hierarchical-lod" &&
    nodeCount < config.communityColorMaxNodes
  ) {
    return "community-force";
  }

  return mode;
}
