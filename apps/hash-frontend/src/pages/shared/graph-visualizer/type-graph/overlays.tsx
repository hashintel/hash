/**
 * Leaf components for the type lifecycle's HTML overlays (hover / selection /
 * edge cards, always-on labels). Each subscribes to exactly the
 * {@link SceneOverlayStore} slice it renders, so the Scene's per-frame
 * position re-emissions re-render only the one affected leaf -- never the
 * bridge component that owns the worker (see the entity mirror,
 * `entity-graph/overlays.tsx`).
 */
import { NodeLabelOverlay } from "../components/node-label-overlay";
import { useOverlaySlice } from "../components/scene-overlay-store";
import { EdgeHoverCard, TypeHoverCard } from "./hover-card";

import type { SceneOverlayStore } from "../components/scene-overlay-store";
import type { TypeDisplayInfo } from "./build-graph";
import type { VersionedUrl } from "@blockprotocol/type-system";

interface TypeOverlayContext {
  readonly overlayStore: SceneOverlayStore<VersionedUrl>;
  readonly getDisplayInfo: (url: VersionedUrl) => TypeDisplayInfo | undefined;
}

/**
 * The transient hover card over a type dot. Suppressed while that same dot is
 * pinned (selected) so the two cards don't stack.
 */
export const TypeHoverOverlay = ({
  overlayStore,
  getDisplayInfo,
}: TypeOverlayContext) => {
  const hover = useOverlaySlice(overlayStore.nodeHover);
  const selection = useOverlaySlice(overlayStore.selection);

  if (hover === null || hover.nodeId === selection?.nodeId) {
    return null;
  }

  const display = getDisplayInfo(hover.nodeId);
  if (display === undefined) {
    return null;
  }

  return <TypeHoverCard display={display} x={hover.x} y={hover.y} />;
};

interface TypeSelectionOverlayProps extends TypeOverlayContext {
  /** Open the selected type (undefined for the synthetic Anything node). */
  readonly onOpen?: () => void;
}

/**
 * The selected type's pinned card (with an Open action) that tracks the
 * node's on-screen position through settle + pan/zoom.
 */
export const TypeSelectionOverlay = ({
  overlayStore,
  getDisplayInfo,
  onOpen,
}: TypeSelectionOverlayProps) => {
  const selection = useOverlaySlice(overlayStore.selection);

  if (selection === null) {
    return null;
  }

  const display = getDisplayInfo(selection.nodeId);
  if (display === undefined) {
    return null;
  }

  return (
    <TypeHoverCard
      display={display}
      x={selection.x}
      y={selection.y}
      // The synthetic Anything node has no type page to open.
      onOpen={display.kind === "anything" ? undefined : onOpen}
    />
  );
};

/** The hovered link-type edge's card, naming the link and its endpoints. */
export const TypeEdgeHoverOverlay = ({
  overlayStore,
  getDisplayInfo,
}: TypeOverlayContext) => {
  const edgeHover = useOverlaySlice(overlayStore.edgeHover);

  if (edgeHover === null) {
    return null;
  }

  const linkType = getDisplayInfo(edgeHover.linkType);
  const source = getDisplayInfo(edgeHover.source);
  const target = getDisplayInfo(edgeHover.target);
  if (!linkType) {
    return null;
  }

  return (
    <EdgeHoverCard
      linkTypeTitle={linkType.title}
      sourceTitle={source?.title ?? edgeHover.source}
      targetTitle={target?.title ?? edgeHover.target}
      x={edgeHover.x}
      y={edgeHover.y}
    />
  );
};

/**
 * The always-on type labels, re-emitted by the Scene each frame with current
 * on-screen positions so they track the camera + settling layout.
 */
export const TypeLabelsOverlay = ({
  overlayStore,
}: Pick<TypeOverlayContext, "overlayStore">) => {
  const labels = useOverlaySlice(overlayStore.nodeLabels);

  return <NodeLabelOverlay labels={labels} />;
};
