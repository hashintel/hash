import {
  NodeToolbar,
  Position,
  useInternalNode,
  useViewport,
} from "@xyflow/react";
import { lazy, Suspense, use, useEffect } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { ActiveNetContext } from "../../../../../../react/state/active-net-context";
import { EditorContext } from "../../../../../../react/state/editor-context";
import { UserSettingsContext } from "../../../../../../react/state/user-settings-context";
import { useCodeNavigation } from "../../../../../monaco/code-navigation";
import { getDocumentUri } from "../../../../../monaco/editor-paths";
import { usePetrinautPresentation } from "../../../../shared/presentation-context";
import { VisualizerLoading } from "../../../../shared/visualizer-loading";
import { VisualizerWindow } from "./place-state-tooltip/visualizer-window";

import type { PointerEvent } from "react";

const PlaceStateVisualization = lazy(() =>
  import("../../../../shared/place-state-visualization").then((module) => ({
    default: module.PlaceStateVisualization,
  })),
);

const triggerStyle = css({
  display: "flex",
  width: "[22px]",
  height: "[22px]",
  borderRadius: "full",
  backgroundColor: "neutral.s00",
  border: "[1px solid {colors.neutral.bd.subtle}]",
  boxShadow: "[0 1px 4px rgba(0, 0, 0, 0.18)]",
  "&[data-animated='true']": {
    transition: "[opacity 100ms ease-out, transform 120ms ease-out]",
    "@starting-style": { opacity: "[0]", transform: "[scale(0.75)]" },
    _hover: { transform: "[scale(1.1)]" },
    "@media (prefers-reduced-motion: reduce)": {
      transition: "[none]",
      transform: "none",
    },
  },
  _hover: {
    backgroundColor: "neutral.s30",
    boxShadow: "[0 2px 6px rgba(0, 0, 0, 0.22)]",
  },
  "&:has(:focus-visible)": {
    outline: "[2px solid {colors.blue.s80}]",
    outlineOffset: "[2px]",
  },
});

export const PlaceStateTooltip = ({ nodeId }: { nodeId: string }) => {
  const presentation = usePetrinautPresentation();
  const { activeNet } = use(ActiveNetContext);
  const { showAnimations } = use(UserSettingsContext);
  const {
    pinnedVisualizerPlaceIds,
    openVisualizerPlaceId,
    focusedVisualizerPlaceId,
    toggleVisualizerPin,
    openPlaceVisualizer,
    hoveredItem,
    setHoveredItem,
    clearHoveredItem,
  } = use(EditorContext);
  const codeNavigation = useCodeNavigation();
  const node = useInternalNode(nodeId);
  const viewport = useViewport();
  const pinned = pinnedVisualizerPlaceIds.has(nodeId);
  const editing = focusedVisualizerPlaceId === nodeId;
  const opened = openVisualizerPlaceId === nodeId;
  const openingEditor =
    codeNavigation.focusRequest?.path ===
    getDocumentUri("place-visualizer", nodeId);

  useEffect(() => {
    if (
      !opened ||
      pinned ||
      editing ||
      openingEditor ||
      hoveredItem?.id === nodeId
    )
      return;
    // Give the pointer time to cross the gap between the place and its preview.
    const timeout = setTimeout(() => openPlaceVisualizer(null), 200);
    return () => clearTimeout(timeout);
  }, [
    opened,
    pinned,
    editing,
    openingEditor,
    hoveredItem?.id,
    nodeId,
    openPlaceVisualizer,
  ]);

  const place = activeNet.places.find((candidate) => candidate.id === nodeId);
  const placeType = activeNet.types.find((type) => type.id === place?.colorId);
  if (
    !presentation.showCustomVisualizers ||
    !place ||
    place.visualizerCode === undefined ||
    !node
  )
    return null;

  const keepHovered = {
    onPointerEnter: () => setHoveredItem({ type: "place", id: nodeId }),
    onPointerLeave: (event: PointerEvent) => {
      if (
        event.relatedTarget instanceof Element &&
        event.relatedTarget.closest(".react-flow__node")
      )
        return;
      clearHoveredItem();
    },
  };

  if (pinned || opened || editing) {
    return (
      <VisualizerWindow
        nodeId={nodeId}
        name={place.name}
        pinned={pinned}
        editing={editing}
        dimmed={focusedVisualizerPlaceId !== null && !editing}
        animated={showAnimations}
        onTogglePin={() => toggleVisualizerPin(nodeId)}
        onEdit={
          codeNavigation.enabled
            ? () =>
                codeNavigation.open(
                  getDocumentUri("place-visualizer", nodeId),
                  { maximize: true },
                )
            : undefined
        }
        {...keepHovered}
        onPointerEnter={() => {
          keepHovered.onPointerEnter();
          openPlaceVisualizer(nodeId);
        }}
      >
        <Suspense fallback={<VisualizerLoading />}>
          <PlaceStateVisualization
            place={place}
            placeType={placeType ?? null}
          />
        </Suspense>
      </VisualizerWindow>
    );
  }
  if (
    !placeType?.elements.length ||
    !place.visualizerCode ||
    hoveredItem?.id !== nodeId ||
    node.dragging
  )
    return null;

  const below =
    node.internals.positionAbsolute.y * viewport.zoom + viewport.y < 94;
  return (
    <NodeToolbar
      nodeId={nodeId}
      isVisible
      position={below ? Position.Bottom : Position.Top}
      offset={-11}
    >
      <div
        className={triggerStyle}
        data-animated={showAnimations}
        {...keepHovered}
      >
        <Button
          className={css({
            width: "[20px]",
            minWidth: "[20px]",
            height: "[20px]",
            padding: "[0]",
          })}
          size="xs"
          variant="ghost"
          shape="round"
          iconName="eye"
          aria-label="Show state visualizer"
          tooltip="Show state visualizer"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            openPlaceVisualizer(nodeId);
          }}
        />
      </div>
    </NodeToolbar>
  );
};
