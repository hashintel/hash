import { useEffect, useRef, useSyncExternalStore } from "react";

/**
 * Drag a canvas node onto a lever field to point the lever at it: either
 * long-press the node first, or drag it straight out of the canvas. Only
 * active while a lever field is mounted. Once a lever drag starts, a name
 * chip follows the pointer, the canvas's own drag, pan and click are held
 * off, and the node goes back to where it was.
 */

const LONG_PRESS_MS = 300;
const MOVE_TOLERANCE_PX = 6;

type DropTarget = {
  element: HTMLElement;
  accepts: (nodeId: string) => boolean;
  drop: (nodeId: string) => void;
};

export type LeverDragState = {
  nodeId: string;
  /** The field under the pointer that accepts the node, if any. */
  over: HTMLElement | null;
} | null;

const targets = new Set<DropTarget>();
let state: LeverDragState = null;
const listeners = new Set<() => void>();

const emit = (next: LeverDragState) => {
  if (next?.nodeId === state?.nodeId && next?.over === state?.over) {
    return;
  }
  state = next;
  for (const listener of listeners) {
    listener();
  }
};

let press: {
  nodeId: string;
  label: string;
  canvas: Element | null;
  x: number;
  y: number;
  timer: number;
  /** The pointer moved before the long press: the canvas is dragging the node. */
  moving: boolean;
} | null = null;
/** The node a lever drag just dropped, so the canvas does not commit its move. */
let claimed: string | null = null;
let chip: HTMLDivElement | null = null;
let cursorStyle: HTMLStyleElement | null = null;

const targetAt = (x: number, y: number, nodeId: string): DropTarget | null => {
  for (const target of targets) {
    const rect = target.element.getBoundingClientRect();
    if (
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom &&
      target.accepts(nodeId)
    ) {
      return target;
    }
  }
  return null;
};

const placeChip = (x: number, y: number) => {
  if (chip) {
    chip.style.transform = `translate(${x + 14}px, ${y + 10}px)`;
  }
};

const startDrag = () => {
  if (!press) {
    return;
  }
  chip = document.createElement("div");
  chip.textContent = press.label;
  Object.assign(chip.style, {
    position: "fixed",
    left: "0",
    top: "0",
    zIndex: "2147483647",
    pointerEvents: "none",
    padding: "4px 10px",
    borderRadius: "6px",
    background: "white",
    border: "1px solid rgba(0, 0, 0, 0.12)",
    boxShadow: "0 4px 14px rgba(0, 0, 0, 0.14)",
    font: "500 13px system-ui, sans-serif",
    color: "#262626",
    whiteSpace: "nowrap",
    opacity: "0",
    transition: "opacity 90ms ease-out",
  });
  document.body.append(chip);
  placeChip(press.x, press.y);
  requestAnimationFrame(() => {
    if (chip) {
      chip.style.opacity = "1";
    }
  });
  cursorStyle = document.createElement("style");
  cursorStyle.textContent = "* { cursor: grabbing !important; }";
  document.head.append(cursorStyle);
  emit({ nodeId: press.nodeId, over: null });
};

const endPress = () => {
  if (press) {
    window.clearTimeout(press.timer);
  }
  press = null;
  chip?.remove();
  chip = null;
  cursorStyle?.remove();
  cursorStyle = null;
  emit(null);
};

/** Holds a canvas event back while a lever drag is running. */
const swallow = (event: Event) => {
  // The canvas's drag listens on the window in the capture phase too.
  event.stopImmediatePropagation();
  event.preventDefault();
};

const onPointerDown = (event: PointerEvent) => {
  if (event.button !== 0 || targets.size === 0) {
    return;
  }
  const nodeElement = (event.target as Element | null)?.closest<HTMLElement>(
    ".react-flow__node[data-id]",
  );
  const nodeId = nodeElement?.dataset.id;
  if (!nodeElement || !nodeId) {
    return;
  }
  const label =
    nodeElement.innerText.split("\n").find((line) => line.trim() !== "") ??
    nodeId;
  press = {
    nodeId,
    label: label.trim(),
    canvas: nodeElement.closest(".react-flow"),
    x: event.clientX,
    y: event.clientY,
    timer: window.setTimeout(startDrag, LONG_PRESS_MS),
    moving: false,
  };
};

const onMove = (event: PointerEvent | MouseEvent) => {
  if (!press) {
    return;
  }
  if (!state) {
    if (
      !press.moving &&
      Math.hypot(event.clientX - press.x, event.clientY - press.y) >
        MOVE_TOLERANCE_PX
    ) {
      // Moved before the long press: the canvas drags the node as usual.
      window.clearTimeout(press.timer);
      press.moving = true;
    }
    // Panels overlay the canvas, so test what is on top under the pointer.
    const under = document.elementFromPoint(event.clientX, event.clientY);
    const outside =
      press.canvas !== null && under !== null && !press.canvas.contains(under);
    if (!press.moving || !outside) {
      return;
    }
    // The node left the canvas: it becomes a lever drag from here.
    press.x = event.clientX;
    press.y = event.clientY;
    startDrag();
  }
  swallow(event);
  placeChip(event.clientX, event.clientY);
  const { nodeId } = press;
  emit({
    nodeId,
    over: targetAt(event.clientX, event.clientY, nodeId)?.element ?? null,
  });
};

const onPointerUp = (event: PointerEvent) => {
  if (!press) {
    return;
  }
  if (state) {
    const target = targetAt(event.clientX, event.clientY, state.nodeId);
    const { nodeId } = state;
    claimed = nodeId;
    // The release would otherwise click the node and select it.
    window.addEventListener("click", swallow, { capture: true, once: true });
    window.setTimeout(
      () => window.removeEventListener("click", swallow, true),
      0,
    );
    endPress();
    target?.drop(nodeId);
    return;
  }
  endPress();
};

const onKeyDown = (event: KeyboardEvent) => {
  if (state && event.key === "Escape") {
    swallow(event);
    endPress();
  }
};

const install = () => {
  window.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("pointermove", onMove, true);
  window.addEventListener("mousemove", onMove, true);
  window.addEventListener("pointerup", onPointerUp, true);
  window.addEventListener("keydown", onKeyDown, true);
};

const uninstall = () => {
  window.removeEventListener("pointerdown", onPointerDown, true);
  window.removeEventListener("pointermove", onMove, true);
  window.removeEventListener("mousemove", onMove, true);
  window.removeEventListener("pointerup", onPointerUp, true);
  window.removeEventListener("keydown", onKeyDown, true);
  endPress();
};

/**
 * Called as the canvas commits a node drag: true when a lever drag took the
 * node, so its position must not change.
 */
export const takeLeverDropClaim = (nodeId: string): boolean => {
  const taken = claimed === nodeId;
  claimed = null;
  return taken;
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useLeverDrag = (): LeverDragState =>
  useSyncExternalStore(
    subscribe,
    () => state,
    () => null,
  );

/** Makes an element a lever drop target while it is mounted. */
export const useLeverDropTarget = (
  element: HTMLElement | null,
  accepts: (nodeId: string) => boolean,
  drop: (nodeId: string) => void,
): void => {
  const latest = useRef({ accepts, drop });
  useEffect(() => {
    latest.current = { accepts, drop };
  });

  useEffect(() => {
    if (!element) {
      return;
    }
    if (targets.size === 0) {
      install();
    }
    const target: DropTarget = {
      element,
      accepts: (nodeId) => latest.current.accepts(nodeId),
      drop: (nodeId) => latest.current.drop(nodeId),
    };
    targets.add(target);
    return () => {
      targets.delete(target);
      if (targets.size === 0) {
        uninstall();
      }
    };
  }, [element]);
};
