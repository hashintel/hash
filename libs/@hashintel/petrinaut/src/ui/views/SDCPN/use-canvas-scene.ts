import { use, useState } from "react";

import {
  classicNodeDimensions,
  compactNodeDimensions,
} from "@hashintel/petrinaut-core";

import { ActiveNetContext } from "../../../react/state/active-net-context";
import { EditorContext } from "../../../react/state/editor-context";
import { SDCPNContext } from "../../../react/state/sdcpn-context";
import { UserSettingsContext } from "../../../react/state/user-settings-context";
import { buildCanvasFocus } from "./canvas-focus";
import { buildCanvasScene, type CanvasScene } from "./canvas-scene";
import { usePointerAtRest } from "./hooks/util/use-pointer-at-rest";
import { useStableItems } from "./use-stable-items";

/** The scene for the active net, as the editor currently shows it. */
export const useCanvasScene = (): CanvasScene => {
  const { activeNet } = use(ActiveNetContext);
  const { extensions, petriNetDefinition } = use(SDCPNContext);
  const { draggingStateByNodeId, isSelected, selection, hoveredItem } =
    use(EditorContext);
  const { compactNodes } = use(UserSettingsContext);

  /*
   * The neighbourhood follows the pointer only once it stops. Sweeping across
   * the canvas passes over nodes without lighting any of them up, and what
   * settles is whatever the pointer came to rest on rather than everything it
   * crossed to get there.
   */
  const hoveredId = hoveredItem?.id ?? null;
  const pointerAtRest = usePointerAtRest();
  const [settledHoverId, setSettledHoverId] = useState(hoveredId);
  if (pointerAtRest && settledHoverId !== hoveredId) {
    setSettledHoverId(hoveredId);
  }

  const scene = buildCanvasScene({
    net: activeNet,
    sdcpn: petriNetDefinition,
    extensions,
    dimensions: compactNodes ? compactNodeDimensions : classicNodeDimensions,
    draggingStateByNodeId,
    isSelected,
    focus: buildCanvasFocus({
      net: activeNet,
      hoveredId: settledHoverId,
      selectedIds: new Set(selection.keys()),
    }),
  });

  // A hover re-roles a handful of items and rebuilds them all. Carrying the
  // untouched ones over at their previous identity is what lets the renderer
  // skip them.
  return {
    ...scene,
    nodes: useStableItems(scene.nodes),
    arcs: useStableItems(scene.arcs),
  };
};
