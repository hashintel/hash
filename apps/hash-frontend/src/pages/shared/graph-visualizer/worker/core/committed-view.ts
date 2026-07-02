import type { ClusterId } from "../../ids";
import type { CutIndex, EdgeFrame } from "../geometry/edge-aggregation";
import type { ClusterNode } from "../hierarchy/cluster-tree";

/** A visible cluster plus its container nesting depth (0 = leaf/standalone). */
export interface RenderedEntry {
  readonly node: ClusterNode;
  readonly depth: number;
}

/**
 * The committed hierarchical view: the visible cluster set and the topology
 * derived from it at the last structure commit. One mutable instance is
 * shared by the commit path (writer) and the frame emitters (readers), so a
 * position tick always renders exactly the topology the last commit produced.
 *
 * `cutIndex`/`edgeFrame` are `undefined` outside the hierarchical regime and
 * before the first viewport arrives.
 */
export class CommittedView {
  /** Committed visible clusters, in a stable order; positions index-align. */
  rendered: RenderedEntry[] = [];
  readonly renderedIndex = new Map<ClusterId, number>();

  /** Cached topology from the last structure commit; drives position-only ticks. */
  cutIndex: CutIndex | undefined;
  edgeFrame: EdgeFrame | undefined;

  /** Bumped on every cluster-tree mutation; compared against committed values to detect no-ops. */
  clusterEpoch = 0;
  /** Epoch and link count as of the last emitted hierarchical structure frame. */
  committedClusterEpoch = -1;
  committedLinkCount = -1;

  /** Replace the visible set and rebuild the id-to-position index. */
  replaceRendered(rendered: RenderedEntry[]): void {
    this.rendered = rendered;
    this.renderedIndex.clear();
    for (let idx = 0; idx < rendered.length; idx++) {
      this.renderedIndex.set(rendered[idx]!.node.id, idx);
    }
  }

  clearRendered(): void {
    this.rendered = [];
    this.renderedIndex.clear();
  }

  clearTopology(): void {
    this.cutIndex = undefined;
    this.edgeFrame = undefined;
  }
}
