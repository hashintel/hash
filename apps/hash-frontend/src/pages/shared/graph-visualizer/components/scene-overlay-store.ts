/**
 * Render-free bus for the Scene's per-frame overlay reports (hover cards, the pinned
 * selection card, the hub labels): the Scene re-emits current on-screen positions EVERY
 * FRAME while the camera moves or the layout settles, so holding them as bridge state
 * would re-render the whole bridge per frame. Instead each report lands in a slice here
 * and only the leaf overlay subscribed to that slice re-renders (`useOverlaySlice`).
 */
import { useSyncExternalStore } from "react";

import type {
  ClusterHover,
  FlatEdgeHover,
  HighwayHover,
  NodeHover,
  NodeLabel,
  NodeSelection,
} from "../render/scene/scene";

/**
 * Grace period the frontier-cluster card stays open after the cursor leaves its bubble, so
 * the cursor can reach the card's Load button (the standard interactive-tooltip handoff).
 */
const CLUSTER_CARD_CLOSE_GRACE_MS = 140;

/** One overlay value, subscribable by exactly the component that renders it. */
export class OverlaySlice<Value> {
  #value: Value;
  readonly #listeners = new Set<() => void>();

  constructor(initialValue: Value) {
    this.#value = initialValue;
  }

  readonly getValue = (): Value => this.#value;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);

    return () => {
      this.#listeners.delete(listener);
    };
  };

  readonly setValue = (next: Value): void => {
    if (Object.is(next, this.#value)) {
      return;
    }

    this.#value = next;

    for (const listener of this.#listeners) {
      listener();
    }
  };
}

/** Subscribe to one slice; re-renders only the calling component when it changes. */
export const useOverlaySlice = <Value>(slice: OverlaySlice<Value>): Value =>
  useSyncExternalStore(slice.subscribe, slice.getValue, slice.getValue);

const noLabels: readonly [] = [];

export class SceneOverlayStore<NodeId extends string> {
  readonly nodeHover = new OverlaySlice<NodeHover<NodeId> | null>(null);
  readonly edgeHover = new OverlaySlice<FlatEdgeHover<NodeId> | null>(null);
  readonly highwayHover = new OverlaySlice<HighwayHover | null>(null);
  readonly selection = new OverlaySlice<NodeSelection<NodeId> | null>(null);
  readonly nodeLabels = new OverlaySlice<readonly NodeLabel<NodeId>[]>(
    noLabels,
  );

  /**
   * The hovered wholly-frontier cluster, shown as an interactive load card. Unlike the other
   * hover cards this one has a button, so it stays open while the cursor is over the bubble
   * OR the card: a bubble-leave starts a short grace timer that the card's own enter cancels.
   */
  readonly clusterHover = new OverlaySlice<ClusterHover | null>(null);

  #clusterCardHovered = false;
  #clusterCloseTimer: ReturnType<typeof setTimeout> | null = null;

  /** Scene-facing: a cluster-bubble hover report, or null when the cursor leaves the bubble. */
  readonly handleClusterHover = (hover: ClusterHover | null): void => {
    if (hover !== null) {
      this.#cancelClusterCloseTimer();
      this.clusterHover.setValue(hover);
      return;
    }

    // The cursor left the bubble; keep the card briefly so it can reach the button. The
    // card's own mouse-enter cancels this; its mouse-leave closes immediately.
    if (this.#clusterCardHovered || this.#clusterCloseTimer !== null) {
      return;
    }

    this.#clusterCloseTimer = setTimeout(() => {
      this.#clusterCloseTimer = null;
      if (!this.#clusterCardHovered) {
        this.clusterHover.setValue(null);
      }
    }, CLUSTER_CARD_CLOSE_GRACE_MS);
  };

  readonly handleClusterCardEnter = (): void => {
    this.#clusterCardHovered = true;
    this.#cancelClusterCloseTimer();
  };

  readonly handleClusterCardLeave = (): void => {
    this.#clusterCardHovered = false;
    this.clusterHover.setValue(null);
  };

  /** Close the cluster card now (its Load action fired). */
  readonly dismissClusterCard = (): void => {
    this.#clusterCardHovered = false;
    this.#cancelClusterCloseTimer();
    this.clusterHover.setValue(null);
  };

  /** Clear all transient overlay state (scene torn down / worker recreated). */
  reset(): void {
    this.#clusterCardHovered = false;
    this.#cancelClusterCloseTimer();
    this.nodeHover.setValue(null);
    this.edgeHover.setValue(null);
    this.highwayHover.setValue(null);
    this.clusterHover.setValue(null);
    this.selection.setValue(null);
    this.nodeLabels.setValue(noLabels);
  }

  #cancelClusterCloseTimer(): void {
    if (this.#clusterCloseTimer !== null) {
      clearTimeout(this.#clusterCloseTimer);
      this.#clusterCloseTimer = null;
    }
  }
}
