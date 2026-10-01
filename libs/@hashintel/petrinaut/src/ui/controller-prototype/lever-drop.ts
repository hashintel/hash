import { useEffect, useRef, useSyncExternalStore } from "react";

/**
 * Drag a canvas node onto a lever field to point the lever at it. Only
 * active while a lever field is mounted.
 *
 * Long-press the node, or drag it straight out of the canvas: a copy of the
 * node lifts off and follows the pointer while the node dims in place.
 * Dropping it on a field that accepts it shrinks the ghost into the field;
 * anywhere else, or Escape, flies it back. The node keeps its position, and
 * the canvas's own drag, pan and click are held off once the ghost is out.
 */

const LONG_PRESS_MS = 300;
const MOVE_TOLERANCE_PX = 6;
const LIFT_MS = 180;
const DROP_MS = 120;
const CANCEL_MS = 220;
const LIFT_SCALE = 1.04;
const DIMMED_OPACITY = "0.4";
const DECELERATE = "cubic-bezier(0.2, 0.9, 0.25, 1)";

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

type Press = {
  nodeId: string;
  node: HTMLElement;
  /** The node's box on screen when pressed. */
  rect: DOMRect;
  x: number;
  y: number;
  timer: number;
  canvas: Element | null;
  /** The pointer moved before the long press: the canvas is dragging the node. */
  moving: boolean;
};

let press: Press | null = null;
let ghost: HTMLElement | null = null;
let cursorStyle: HTMLStyleElement | null = null;
/** The node a lever drag just ended on, so the canvas does not commit a move. */
let claimed: string | null = null;

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

/** Petrinaut's root, where its styles apply: the ghost mounts there. */
const layerFor = (node: HTMLElement): HTMLElement =>
  node.closest<HTMLElement>(".petrinaut-root") ?? document.body;

const placeGhost = (x: number, y: number, scale: number) => {
  if (!ghost || !press) {
    return;
  }
  ghost.style.transform = `translate(${x - press.x}px, ${y - press.y}px) scale(${scale})`;
};

const lift = () => {
  if (!press) {
    return;
  }
  const { node, rect } = press;

  // The clone renders outside the canvas's zoom, so scale it to match.
  const zoom = rect.width / Math.max(1, node.offsetWidth);
  const copy = node.cloneNode(true) as HTMLElement;
  copy.removeAttribute("data-id");
  copy.classList.remove("selected");
  for (const handle of copy.querySelectorAll(".react-flow__handle")) {
    handle.remove();
  }
  ghost = document.createElement("div");
  ghost.setAttribute("aria-hidden", "true");
  Object.assign(ghost.style, {
    position: "fixed",
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    zIndex: "2147483647",
    pointerEvents: "none",
    transformOrigin: "center",
    transition: `transform ${LIFT_MS}ms ${DECELERATE}, filter ${LIFT_MS}ms ${DECELERATE}`,
    filter: "drop-shadow(0 0 0 rgba(0, 0, 0, 0))",
  });
  Object.assign(copy.style, {
    position: "absolute",
    left: "0",
    top: "0",
    transform: `scale(${zoom})`,
    transformOrigin: "top left",
    opacity: "1",
    pointerEvents: "none",
  });
  ghost.append(copy);
  layerFor(node).append(ghost);
  placeGhost(press.x, press.y, 1);
  requestAnimationFrame(() => {
    if (!ghost || !press) {
      return;
    }
    ghost.style.filter = "drop-shadow(0 10px 18px rgba(0, 0, 0, 0.22))";
    placeGhost(press.x, press.y, LIFT_SCALE);
    // After the lift, the ghost tracks the pointer without easing.
    window.setTimeout(() => {
      if (ghost) {
        ghost.style.transition = `filter ${LIFT_MS}ms ${DECELERATE}, opacity 90ms ease-out`;
      }
    }, LIFT_MS);
  });

  node.style.transition = `opacity ${LIFT_MS}ms ease-out`;
  node.style.opacity = DIMMED_OPACITY;

  cursorStyle = document.createElement("style");
  cursorStyle.textContent = "* { cursor: grabbing !important; }";
  document.head.append(cursorStyle);
  emit({ nodeId: press.nodeId, over: null });
};

/** Removes everything the gesture added, after the ghost's last animation. */
const finish = (afterMs: number) => {
  const done = { ghost, node: press?.node };
  if (press) {
    window.clearTimeout(press.timer);
  }
  press = null;
  ghost = null;
  cursorStyle?.remove();
  cursorStyle = null;
  emit(null);
  if (done.node) {
    done.node.style.opacity = "";
    window.setTimeout(() => {
      if (done.node) {
        done.node.style.transition = "";
      }
    }, LIFT_MS);
  }
  window.setTimeout(() => done.ghost?.remove(), afterMs);
};

const dropInto = (field: HTMLElement) => {
  if (!ghost || !press) {
    return;
  }
  const box = field.getBoundingClientRect();
  const dx = box.left + box.width / 2 - (press.rect.left + press.rect.width / 2);
  const dy = box.top + box.height / 2 - (press.rect.top + press.rect.height / 2);
  ghost.style.transition = `transform ${DROP_MS}ms ease-in, opacity ${DROP_MS}ms ease-in`;
  ghost.style.transform = `translate(${dx}px, ${dy}px) scale(0.4)`;
  ghost.style.opacity = "0";
};

const flyBack = () => {
  if (!ghost) {
    return;
  }
  ghost.style.transition = `transform ${CANCEL_MS}ms ${DECELERATE}, filter ${CANCEL_MS}ms ${DECELERATE}`;
  ghost.style.transform = "translate(0px, 0px) scale(1)";
  ghost.style.filter = "drop-shadow(0 0 0 rgba(0, 0, 0, 0))";
};

/** Holds a canvas event back while a lever drag is running. */
const swallow = (event: Event) => {
  // The canvas's drag listens on the window in the capture phase too.
  event.stopImmediatePropagation();
  event.preventDefault();
};

const onPointerDown = (event: PointerEvent) => {
  if (event.button !== 0 || targets.size === 0 || press) {
    return;
  }
  const node = (event.target as Element | null)?.closest<HTMLElement>(
    ".react-flow__node[data-id]",
  );
  const nodeId = node?.dataset.id;
  if (!node || !nodeId) {
    return;
  }
  const rect = node.getBoundingClientRect();
  press = {
    nodeId,
    node,
    rect,
    x: event.clientX,
    y: event.clientY,
    timer: window.setTimeout(lift, LONG_PRESS_MS),
    canvas: node.closest(".react-flow"),
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
    if (!press.moving) {
      return;
    }
    // Panels overlay the canvas, so test what is on top under the pointer.
    const under = document.elementFromPoint(event.clientX, event.clientY);
    if (!press.canvas || !under || press.canvas.contains(under)) {
      return;
    }
    // The node left the canvas: its ghost takes over where it is now.
    press.rect = press.node.getBoundingClientRect();
    press.x = event.clientX;
    press.y = event.clientY;
    lift();
  }
  swallow(event);
  placeGhost(event.clientX, event.clientY, LIFT_SCALE);
  const over =
    targetAt(event.clientX, event.clientY, press.nodeId)?.element ?? null;
  if (ghost) {
    // See-through over a field, so the field's own state shows beneath.
    ghost.style.opacity = over ? "0.7" : "1";
  }
  emit({ nodeId: press.nodeId, over });
};

const onPointerUp = (event: PointerEvent) => {
  if (!press) {
    return;
  }
  if (!state) {
    finish(0);
    return;
  }
  const { nodeId } = press;
  const target = targetAt(event.clientX, event.clientY, nodeId);
  claimed = nodeId;
  // The release would otherwise click the node and select it.
  window.addEventListener("click", swallow, { capture: true, once: true });
  window.setTimeout(() => window.removeEventListener("click", swallow, true), 0);
  if (target) {
    dropInto(target.element);
    finish(DROP_MS);
    target.drop(nodeId);
  } else {
    flyBack();
    finish(CANCEL_MS);
  }
};

const onKeyDown = (event: KeyboardEvent) => {
  if (press && event.key === "Escape") {
    swallow(event);
    claimed = press.nodeId;
    flyBack();
    finish(CANCEL_MS);
  }
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
  if (press) {
    finish(0);
  }
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
