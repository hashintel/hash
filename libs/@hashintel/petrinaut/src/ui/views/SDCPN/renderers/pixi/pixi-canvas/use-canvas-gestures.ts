/**
 * Pointer, wheel and keyboard handling for the Pixi canvas host. Hit testing
 * runs against the scene geometry, and every outcome goes through the shared
 * canvas interactions, so selection, dragging, connecting and placement behave
 * as they do on the React Flow canvas.
 */

import { useEffect, useState, useSyncExternalStore } from "react";

import { useLatest } from "../../../../../../react/hooks/use-latest";
import { arcAtPoint, type ArcPolylines } from "./arc-polylines";
import {
  handleAtPoint,
  handleHitRadius,
  nodeAt,
  nodesInSelectionBox,
  type CanvasHandle,
  type CanvasRect,
  type HandleKind,
} from "./node-geometry";
import {
  panBy,
  screenToScene,
  wheelZoomFactor,
  zoomAt,
  type ViewportStore,
  type ZoomLimits,
} from "./viewport-store";

import type {
  CanvasNode,
  CanvasPoint,
  CanvasScene,
} from "../../../canvas-scene";
import type {
  CanvasConnection,
  CanvasInteractions,
} from "../../../use-canvas-interactions";

/** Pointer travel below this many screen pixels is a click, not a drag. */
const clickThresholdPx = 3;

/** How close, in screen pixels, the pointer must pass to hover an arc. */
const arcHoverTolerancePx = 6;

export type Gesture =
  | { type: "idle" }
  | { type: "pan"; last: CanvasPoint; moved: boolean; allowed: boolean }
  | {
      type: "node";
      nodeId: string;
      start: CanvasPoint;
      startPositions: Map<string, CanvasPoint>;
      moved: boolean;
    }
  | { type: "box"; origin: CanvasPoint; current: CanvasPoint }
  | {
      type: "connect";
      from: CanvasHandle;
      current: CanvasPoint;
      target: CanvasHandle | null;
    };

export type GestureStore = {
  get: () => Gesture;
  set: (gesture: Gesture) => void;
  subscribe: (listener: () => void) => () => void;
};

const createGestureStore = (): GestureStore => {
  let gesture: Gesture = { type: "idle" };
  const listeners = new Set<() => void>();
  return {
    get: () => gesture,
    set: (next) => {
      gesture = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

export const useGesture = (store: GestureStore): Gesture =>
  useSyncExternalStore(store.subscribe, store.get, store.get);

export const selectionBoxOf = (gesture: Gesture): CanvasRect | null => {
  if (gesture.type !== "box") return null;
  return {
    x: Math.min(gesture.origin.x, gesture.current.x),
    y: Math.min(gesture.origin.y, gesture.current.y),
    width: Math.abs(gesture.current.x - gesture.origin.x),
    height: Math.abs(gesture.current.y - gesture.origin.y),
  };
};

const isTextTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  return (
    !!element &&
    (element.tagName === "INPUT" ||
      element.tagName === "TEXTAREA" ||
      element.isContentEditable ||
      element.closest(".monaco-editor") !== null)
  );
};

/** A connection oriented source to target, whichever handle the drag began on. */
const connectionBetween = (
  from: CanvasHandle,
  to: CanvasHandle,
): CanvasConnection => {
  const [source, target] = from.kind === "source" ? [from, to] : [to, from];
  return {
    sourceId: source.nodeId,
    targetId: target.nodeId,
    sourcePortId: source.portId,
    targetPortId: target.portId,
  };
};

export type CanvasGestureInput = {
  scene: CanvasScene;
  polylines: ArcPolylines;
  interactions: CanvasInteractions;
  viewport: ViewportStore;
  zoomLimits: ZoomLimits;
  partialSelection: boolean;
};

export type CanvasGestureHandlers = {
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerLeave: (event: React.PointerEvent<HTMLElement>) => void;
};

export const useCanvasGestures = (
  host: React.RefObject<HTMLDivElement | null>,
  input: CanvasGestureInput,
): {
  gestures: GestureStore;
  handlers: CanvasGestureHandlers;
  cursor: string;
} => {
  const [gestures] = useState(createGestureStore);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [hoverTarget, setHoverTarget] = useState<{
    kind: "node" | "arc" | "handle";
    id: string;
  } | null>(null);
  const latest = useLatest(input);

  // Wheel zoom needs preventDefault, which React's passive wheel listener
  // cannot do, and Space is a global modifier while the pointer is anywhere.
  useEffect(() => {
    const element = host.current;
    if (!element) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const current = latest.current;
      const rect = element.getBoundingClientRect();
      const anchor = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      current.viewport.set(
        zoomAt(
          current.viewport.get(),
          anchor,
          wheelZoomFactor(event),
          current.zoomLimits,
        ),
      );
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" && !isTextTarget(event.target)) {
        setSpaceHeld(true);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpaceHeld(false);
    };

    element.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      element.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [host, latest]);

  const { scene, polylines, interactions, viewport, partialSelection } = input;

  const localPoint = (event: React.PointerEvent<HTMLElement>): CanvasPoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const scenePoint = (event: React.PointerEvent<HTMLElement>) =>
    screenToScene(viewport.get(), localPoint(event));
  const zoom = () => viewport.get().zoom;

  const handleUnder = (point: CanvasPoint) =>
    handleAtPoint(scene.nodes, point, handleHitRadius / zoom());

  const hover = (next: typeof hoverTarget) => {
    if (next?.kind === hoverTarget?.kind && next?.id === hoverTarget?.id)
      return;
    setHoverTarget(next);
    if (!next || next.kind === "handle") {
      interactions.clearHover();
    } else if (next.kind === "arc") {
      interactions.hoverArc(next.id);
    } else {
      const node = scene.nodes.find((candidate) => candidate.id === next.id);
      if (node) interactions.hoverNode(node);
    }
  };

  const updateHover = (point: CanvasPoint) => {
    const handle = interactions.readonly ? null : handleUnder(point);
    if (handle) {
      hover({
        kind: "handle",
        id: `${handle.nodeId}:${handle.kind}:${handle.portId ?? ""}`,
      });
      return;
    }
    const node = nodeAt(scene.nodes, point);
    if (node) {
      hover({ kind: "node", id: node.id });
      return;
    }
    const arc = arcAtPoint(
      scene,
      polylines,
      point,
      arcHoverTolerancePx / zoom(),
    );
    hover(arc ? { kind: "arc", id: arc.id } : null);
  };

  const selectNodeByClick = (node: CanvasNode, additive: boolean) => {
    if (interactions.isAddMode) return;
    if (additive) {
      interactions.applySelectionChanges([
        { id: node.id, selected: !node.selected },
      ]);
      return;
    }
    const others = scene.nodes.filter(
      (candidate) => candidate.selected && candidate.id !== node.id,
    );
    if (node.selected && others.length === 0) return;
    interactions.applySelectionChanges([
      ...others.map((other) => ({ id: other.id, selected: false })),
      { id: node.id, selected: true },
    ]);
  };

  const finishGesture = (point: CanvasPoint, additive: boolean) => {
    const gesture = gestures.get();
    switch (gesture.type) {
      case "pan":
        if (!gesture.moved) interactions.clickPane(point);
        break;
      case "node": {
        const node = scene.nodes.find(
          (candidate) => candidate.id === gesture.nodeId,
        );
        if (gesture.moved) {
          interactions.dropNodes(
            [...gesture.startPositions.keys()].map((id) => ({
              id,
              position:
                scene.nodes.find((candidate) => candidate.id === id)
                  ?.position ?? null,
            })),
          );
        } else if (node) {
          selectNodeByClick(node, additive);
        }
        break;
      }
      case "box":
        interactions.endSelectionGesture();
        break;
      case "connect":
        if (gesture.target) {
          interactions.connect(connectionBetween(gesture.from, gesture.target));
        }
        break;
      case "idle":
        break;
    }
    gestures.set({ type: "idle" });
  };

  const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 && event.button !== 1 && event.button !== 2) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = scenePoint(event);
    const panByButton = event.button !== 0;

    if (!panByButton) {
      const handle = interactions.readonly ? null : handleUnder(point);
      if (handle) {
        gestures.set({
          type: "connect",
          from: handle,
          current: point,
          target: null,
        });
        return;
      }
      const node = nodeAt(scene.nodes, point);
      if (node) {
        const dragged = node.selected
          ? scene.nodes.filter((candidate) => candidate.selected)
          : [node];
        gestures.set({
          type: "node",
          nodeId: node.id,
          start: point,
          startPositions: new Map(
            dragged.map((candidate) => [candidate.id, candidate.position]),
          ),
          moved: false,
        });
        return;
      }
      if (interactions.isSelectMode && !spaceHeld) {
        interactions.beginSelectionGesture();
        gestures.set({ type: "box", origin: point, current: point });
        return;
      }
    }

    // React Flow pans on a left drag in pan mode, on Space, and on the
    // middle or right button; in add modes a left drag does nothing.
    const allowed =
      panByButton ||
      spaceHeld ||
      interactions.isPanMode ||
      !interactions.isAddMode;
    gestures.set({
      type: "pan",
      last: localPoint(event),
      moved: false,
      allowed,
    });
  };

  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const gesture = gestures.get();
    const point = scenePoint(event);

    switch (gesture.type) {
      case "idle":
        updateHover(point);
        return;
      case "pan": {
        const local = localPoint(event);
        const delta = {
          x: local.x - gesture.last.x,
          y: local.y - gesture.last.y,
        };
        const moved =
          gesture.moved || Math.hypot(delta.x, delta.y) >= clickThresholdPx;
        if (gesture.allowed && moved) {
          viewport.set(panBy(viewport.get(), delta));
        }
        gestures.set({ ...gesture, last: local, moved });
        return;
      }
      case "node": {
        const delta = {
          x: point.x - gesture.start.x,
          y: point.y - gesture.start.y,
        };
        const moved =
          gesture.moved ||
          Math.hypot(delta.x, delta.y) * zoom() >= clickThresholdPx;
        if (moved && !interactions.readonly) {
          interactions.moveNodes(
            [...gesture.startPositions].map(([id, start]) => ({
              id,
              position: { x: start.x + delta.x, y: start.y + delta.y },
            })),
          );
        }
        if (moved !== gesture.moved) gestures.set({ ...gesture, moved });
        return;
      }
      case "box": {
        const next = { ...gesture, current: point };
        gestures.set(next);
        const box = selectionBoxOf(next)!;
        const inBox = new Set(
          nodesInSelectionBox(scene.nodes, box, partialSelection).map(
            (node) => node.id,
          ),
        );
        const changes = scene.nodes
          .filter((node) => inBox.has(node.id) !== node.selected)
          .map((node) => ({ id: node.id, selected: inBox.has(node.id) }));
        if (changes.length > 0) interactions.applySelectionChanges(changes);
        return;
      }
      case "connect": {
        const wanted: HandleKind =
          gesture.from.kind === "source" ? "target" : "source";
        const handle = handleUnder(point);
        const node = handle ? null : nodeAt(scene.nodes, point);
        // Dropping anywhere on a place or transition targets its one handle.
        const target: CanvasHandle | null =
          handle?.kind === wanted && handle.nodeId !== gesture.from.nodeId
            ? handle
            : node &&
                node.kind !== "componentInstance" &&
                node.id !== gesture.from.nodeId
              ? {
                  nodeId: node.id,
                  kind: wanted,
                  portId: null,
                  position: node.position,
                }
              : null;
        const valid =
          target !== null &&
          interactions.isValidConnection(
            connectionBetween(gesture.from, target),
          );
        gestures.set({
          ...gesture,
          current: point,
          target: valid ? target : null,
        });
        return;
      }
    }
  };

  const onPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    if (gestures.get().type === "idle") return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    finishGesture(
      scenePoint(event),
      event.shiftKey || event.metaKey || event.ctrlKey,
    );
  };

  const onPointerCancel = onPointerUp;

  const onPointerLeave = (event: React.PointerEvent<HTMLElement>) => {
    if (gestures.get().type !== "idle") return;
    hover(null);
    void event;
  };

  const gesture = useGesture(gestures);
  const cursor =
    gesture.type === "connect" || hoverTarget?.kind === "handle"
      ? "crosshair"
      : gesture.type === "pan" && gesture.allowed && gesture.moved
        ? "grabbing"
        : hoverTarget?.kind === "node"
          ? "default"
          : spaceHeld
            ? "grab"
            : interactions.paneCursor;

  return {
    gestures,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onPointerLeave,
    },
    cursor,
  };
};
