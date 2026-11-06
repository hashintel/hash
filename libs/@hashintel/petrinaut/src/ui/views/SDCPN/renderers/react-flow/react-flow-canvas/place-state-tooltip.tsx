import {
  NodeToolbar,
  Position,
  useInternalNode,
  useViewport,
} from "@xyflow/react";
import { lazy, Suspense, use, useEffect, useState } from "react";

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
    keptOpenVisualizerPlaceIds,
    visualizerStack,
    bringVisualizerToFront,
    openVisualizerPlaceId,
    focusedVisualizerPlaceId,
    keepPlaceVisualizerOpen,
    closePlaceVisualizer,
    openPlaceVisualizer,
    hoveredItem,
    setHoveredItem,
    clearHoveredItem,
  } = use(EditorContext);
  const codeNavigation = useCodeNavigation();
  const node = useInternalNode(nodeId);
  const viewport = useViewport();
  const keptOpen = keptOpenVisualizerPlaceIds.has(nodeId);
  const editing = focusedVisualizerPlaceId === nodeId;
  const opened = openVisualizerPlaceId === nodeId;
  const [eyeHovered, setEyeHovered] = useState(false);
  const [eyeFocused, setEyeFocused] = useState(false);
  const openingEditor =
    codeNavigation.focusRequest?.path ===
    getDocumentUri("place-visualizer", nodeId);

  useEffect(() => {
    if ((!eyeHovered && !eyeFocused) || keptOpen) return;
    const timeout = setTimeout(() => openPlaceVisualizer(nodeId), 15);
    return () => clearTimeout(timeout);
  }, [eyeHovered, eyeFocused, keptOpen, nodeId, openPlaceVisualizer]);

  useEffect(() => {
    if (
      !opened ||
      keptOpen ||
      eyeFocused ||
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
    keptOpen,
    eyeFocused,
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

  const showTrigger =
    !keptOpen &&
    !!placeType?.elements.length &&
    !!place.visualizerCode &&
    (hoveredItem?.id === nodeId || node.selected) &&
    !node.dragging;
  const below =
    node.internals.positionAbsolute.y * viewport.zoom + viewport.y < 94;

  return (
    <>
      {(keptOpen || opened || editing) && (
        <VisualizerWindow
          nodeId={nodeId}
          name={place.name}
          editing={editing}
          muted={focusedVisualizerPlaceId !== null && !editing}
          animated={showAnimations}
          stackIndex={visualizerStack.indexOf(nodeId) + 1}
          onActivate={() => bringVisualizerToFront(nodeId)}
          onKeepOpen={() => {
            setEyeFocused(false);
            setEyeHovered(false);
            keepPlaceVisualizerOpen(nodeId);
          }}
          onClose={() => {
            setEyeHovered(false);
            setEyeFocused(false);
            closePlaceVisualizer(nodeId);
          }}
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
          {(size) => (
            <Suspense fallback={<VisualizerLoading />}>
              <PlaceStateVisualization
                size={size}
                place={place}
                placeType={placeType ?? null}
              />
            </Suspense>
          )}
        </VisualizerWindow>
      )}
      {showTrigger && (
        <NodeToolbar
          nodeId={nodeId}
          isVisible
          position={below ? Position.Bottom : Position.Top}
          offset={-11}
        >
          <div
            className={triggerStyle}
            title="Click to keep open"
            data-animated={showAnimations}
            {...keepHovered}
            onPointerEnter={() => {
              keepHovered.onPointerEnter();
              setEyeHovered(true);
            }}
            onPointerLeave={(event) => {
              setEyeHovered(false);
              keepHovered.onPointerLeave(event);
            }}
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
              onFocus={() => setEyeFocused(true)}
              onBlur={() => setEyeFocused(false)}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Escape") {
                  event.preventDefault();
                  setEyeHovered(false);
                  setEyeFocused(false);
                  closePlaceVisualizer(nodeId);
                }
              }}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                setEyeHovered(false);
                setEyeFocused(false);
                keepPlaceVisualizerOpen(nodeId);
                openPlaceVisualizer(nodeId);
              }}
            />
          </div>
        </NodeToolbar>
      )}
    </>
  );
};
