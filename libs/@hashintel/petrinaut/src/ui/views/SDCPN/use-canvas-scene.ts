import { use } from "react";

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
import { useDebouncedValue } from "./hooks/util/use-debounced-value";
import { HOVER_FOCUS_DELAY_MS } from "./styles/focus";
import { useStableItems } from "./use-stable-items";

/** The scene for the active net, as the editor currently shows it. */
export const useCanvasScene = (): CanvasScene => {
  const { activeNet } = use(ActiveNetContext);
  const { extensions, petriNetDefinition } = use(SDCPNContext);
  const { draggingStateByNodeId, isSelected, selection, hoveredItem } =
    use(EditorContext);
  const { compactNodes } = use(UserSettingsContext);

  // Trailing, so the neighbourhood only lights up once the pointer has come to
  // rest: sweeping the canvas passes over nodes without any of them flashing.
  const settledHoverId = useDebouncedValue(
    hoveredItem?.id ?? null,
    HOVER_FOCUS_DELAY_MS,
  );

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
