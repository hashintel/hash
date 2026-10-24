/**
 * The map's renderer: a Canvas 2D drawing that owns its camera, its node
 * glide and its hover, so none of them pass through React. React hands it
 * a frame, the nodes' targets, the edges and what is emphasised, and gets
 * back selections and activations; everything between pointer and pixel
 * stays here, and the drawing repaints only while something moves.
 */

import { edgeGeometry } from "../../model/layout/geometry";
import { boundsOf, type Box, type Point } from "../../model/layout/types";
import {
  fitCamera,
  mixCamera,
  panCamera,
  toPixel,
  toWorld,
  zoomCameraAt,
  type Camera,
  type Viewport,
} from "./camera";
import { readTheme, type Theme } from "./theme";

import type { ProjectedEdge } from "../../model/projections";

export interface SceneNode extends Box {
  id: string;
  kind: "layer" | "interface" | "external";
  family: string;
  label: string;
  facts: string | null;
  tooltip: string;
  depth: number;
  container: boolean;
  hasPage: boolean;
}

export interface Frame {
  nodes: Map<string, SceneNode>;
  edges: ProjectedEdge[];
  /** Null when nothing filters; a node outside dims. */
  members: Set<string> | null;
  selected: string | null;
  focus: string | null;
  /** What the camera shows when the reader has not moved it. */
  fitTo: Box;
  /** Changes when the view should refit, even if `fitTo` did not. */
  fitKey: string;
}

export interface RendererCallbacks {
  onSelect: (id: string | null) => void;
  onActivate: (id: string) => void;
}

export interface Renderer {
  setFrame: (frame: Frame) => void;
  /** Fits the camera to the frame's box again. */
  fit: () => void;
  zoomBy: (factor: number) => void;
  resize: () => void;
  destroy: () => void;
}

const glideDuration = 480;
const cameraDuration = 420;
const dimmed = 0.16;
const dragThreshold = 3;

const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

const reducedMotion = (): boolean =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const roundedRect = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void => {
  context.beginPath();
  context.roundRect(x, y, width, height, Math.min(radius, height / 2));
};

export const createRenderer = (
  canvas: HTMLCanvasElement,
  callbacks: RendererCallbacks,
): Renderer => {
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("the map needs a 2D canvas context");
  }
  let theme: Theme = readTheme(canvas);
  let viewport: Viewport = { width: 1, height: 1 };
  let frame: Frame | null = null;

  /** Where each node is drawn now, gliding toward the frame's targets. */
  let positions = new Map<string, Box>();
  let glide: { from: Map<string, Box>; startedAt: number } | null = null;

  let camera: Camera = { centerX: 0, centerY: 0, zoom: 1 };
  let cameraGlide: { from: Camera; to: Camera; startedAt: number } | null =
    null;
  /** Whether the reader moved the camera since the last fit. */
  let cameraMoved = false;
  let fitKey = "";

  let hovered: string | null = null;
  let drag: {
    pointerId: number;
    start: Point;
    camera: Camera;
    moved: boolean;
  } | null = null;

  let scheduled = 0;
  const requestPaint = (): void => {
    if (scheduled === 0) {
      scheduled = requestAnimationFrame(tick);
    }
  };

  const adjacency = new Map<string, Set<string>>();
  const rebuildAdjacency = (): void => {
    adjacency.clear();
    for (const edge of frame?.edges ?? []) {
      adjacency.set(
        edge.from,
        (adjacency.get(edge.from) ?? new Set()).add(edge.to),
      );
      adjacency.set(
        edge.to,
        (adjacency.get(edge.to) ?? new Set()).add(edge.from),
      );
    }
  };

  const isMember = (id: string): boolean =>
    frame?.members === null || frame?.members?.has(id) === true;

  const spotlight = (): string | null => hovered ?? frame?.selected ?? null;

  const emphasisOf = (id: string): number => {
    const light = spotlight();
    if (id === light || id === frame?.focus) {
      return 1;
    }
    if (light !== null && adjacency.get(light)?.has(id)) {
      return 1;
    }
    return isMember(id) ? 1 : dimmed;
  };

  const edgeOpacity = (edge: ProjectedEdge): number => {
    const light = spotlight();
    if (light !== null && (edge.from === light || edge.to === light)) {
      return 1;
    }
    if (light !== null) {
      return 0.08;
    }
    if (!isMember(edge.from) || !isMember(edge.to)) {
      return 0.05;
    }
    return edge.kind === "imports" ? 0.3 : 0.75;
  };

  const settlePositions = (now: number): boolean => {
    if (frame === null) {
      return false;
    }
    if (glide === null) {
      return false;
    }
    const duration = reducedMotion() ? 0 : glideDuration;
    const t =
      duration === 0 ? 1 : Math.min(1, (now - glide.startedAt) / duration);
    const eased = easeOutCubic(t);
    const next = new Map<string, Box>();
    for (const [id, target] of frame.nodes) {
      const from = glide.from.get(id);
      next.set(
        id,
        from === undefined
          ? target
          : {
              x: from.x + (target.x - from.x) * eased,
              y: from.y + (target.y - from.y) * eased,
              width: from.width + (target.width - from.width) * eased,
              height: from.height + (target.height - from.height) * eased,
            },
      );
    }
    positions = next;
    if (t >= 1) {
      glide = null;
    }
    return glide !== null;
  };

  const settleCamera = (now: number): boolean => {
    if (cameraGlide === null) {
      return false;
    }
    const duration = reducedMotion() ? 0 : cameraDuration;
    const t =
      duration === 0
        ? 1
        : Math.min(1, (now - cameraGlide.startedAt) / duration);
    camera = mixCamera(cameraGlide.from, cameraGlide.to, easeOutCubic(t));
    if (t >= 1) {
      cameraGlide = null;
    }
    return cameraGlide !== null;
  };

  const glideCameraTo = (target: Camera): void => {
    cameraGlide = { from: camera, to: target, startedAt: performance.now() };
    requestPaint();
  };

  const paintNode = (node: SceneNode, box: Box, strong: boolean): void => {
    const selected = node.id === frame?.selected;
    const focused = node.id === frame?.focus;
    context.globalAlpha = emphasisOf(node.id);
    context.fillStyle = theme.fillOf(node.family);
    context.strokeStyle = theme.strokeOf(node.family);
    context.lineWidth = selected || focused ? 3 : strong ? 2.4 : 1.4;
    context.setLineDash(node.kind === "external" ? [5, 4] : []);
    const radius =
      node.kind === "interface" ? box.height / 2 : node.container ? 10 : 8;
    roundedRect(context, box.x, box.y, box.width, box.height, radius);
    if (node.container) {
      context.globalAlpha *= 0.35;
      context.fill();
      context.globalAlpha = emphasisOf(node.id);
    } else {
      context.fill();
    }
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = theme.text;
    if (node.kind === "interface") {
      context.font = `600 11px ${theme.mono}`;
      context.textAlign = "center";
      context.fillText(
        node.label,
        box.x + box.width / 2,
        box.y + box.height / 2 + 4,
        box.width - 16,
      );
      context.textAlign = "left";
      return;
    }
    context.font = `${node.container ? 700 : 600} 12px ${theme.font}`;
    context.globalAlpha *= node.container ? 0.85 : 1;
    context.fillText(
      node.label,
      box.x + 10,
      box.y + (node.container ? 20 : 19),
      box.width - 16,
    );
    if (!node.container && node.facts !== null) {
      context.globalAlpha = emphasisOf(node.id);
      context.fillStyle = theme.muted;
      context.font = `10px ${theme.font}`;
      context.fillText(node.facts, box.x + 10, box.y + 35, box.width - 16);
    }
  };

  const paintEdge = (edge: ProjectedEdge, showLabels: boolean): void => {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (from === undefined || to === undefined || edge.from === edge.to) {
      return;
    }
    const bend = edge.kind === "spoke" ? 0 : edge.from < edge.to ? 0.12 : -0.12;
    const geometry = edgeGeometry(from, to, bend);
    const light = spotlight();
    const strong = light !== null && (edge.from === light || edge.to === light);
    const colour =
      edge.kind === "imports"
        ? theme.edges.imports
        : edge.kind === "declared"
          ? theme.edges.declared
          : theme.edges.interface;
    context.globalAlpha = edgeOpacity(edge);
    context.strokeStyle = colour;
    context.fillStyle = colour;
    context.lineWidth = strong
      ? 2.6
      : edge.kind === "imports"
        ? 1 + Math.log2(edge.weight) * 0.6
        : 1.4;
    const dashed =
      edge.kind === "declared"
        ? [6, 4]
        : edge.role === "provides" || edge.role === "implements"
          ? [3, 3]
          : [];
    context.setLineDash(dashed);
    const path = new Path2D(geometry.d);
    context.stroke(path);
    context.setLineDash([]);
    paintMarker(edge, geometry.end, geometry.direction, colour);
    if (edge.label !== null && (strong || showLabels)) {
      context.font = `11px ${theme.font}`;
      context.textAlign = "center";
      context.lineWidth = 4;
      context.strokeStyle = theme.background;
      context.lineJoin = "round";
      context.strokeText(edge.label, geometry.mid.x, geometry.mid.y - 4);
      context.fillStyle = theme.text;
      context.fillText(edge.label, geometry.mid.x, geometry.mid.y - 4);
      context.textAlign = "left";
    }
  };

  const paintMarker = (
    edge: ProjectedEdge,
    tip: Point,
    direction: Point,
    colour: string,
  ): void => {
    if (edge.role === "defines") {
      return;
    }
    const circle = edge.role === "provides" || edge.role === "implements";
    if (circle) {
      context.beginPath();
      context.arc(
        tip.x - direction.x * 4,
        tip.y - direction.y * 4,
        3.5,
        0,
        Math.PI * 2,
      );
      context.fillStyle = theme.background;
      context.fill();
      context.lineWidth = 1.5;
      context.strokeStyle = colour;
      context.stroke();
      return;
    }
    const size = 7;
    const normal = { x: -direction.y, y: direction.x };
    context.beginPath();
    context.moveTo(tip.x, tip.y);
    context.lineTo(
      tip.x - direction.x * size + normal.x * size * 0.5,
      tip.y - direction.y * size + normal.y * size * 0.5,
    );
    context.lineTo(
      tip.x - direction.x * size - normal.x * size * 0.5,
      tip.y - direction.y * size - normal.y * size * 0.5,
    );
    context.closePath();
    context.fillStyle = colour;
    context.fill();
  };

  const paint = (): void => {
    const ratio = window.devicePixelRatio || 1;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = theme.background;
    context.fillRect(0, 0, viewport.width, viewport.height);
    if (frame === null) {
      return;
    }
    const origin = toPixel(camera, { x: 0, y: 0 }, viewport);
    context.translate(origin.x, origin.y);
    context.scale(camera.zoom, camera.zoom);
    context.lineJoin = "round";

    const ordered = [...frame.nodes.values()].sort(
      (left, right) =>
        Number(right.container) - Number(left.container) ||
        left.depth - right.depth,
    );
    const light = spotlight();
    for (const node of ordered) {
      if (node.container) {
        const box = positions.get(node.id);
        if (box !== undefined) {
          paintNode(node, box, node.id === light);
        }
      }
    }
    const showLabels = frame.focus !== null;
    for (const edge of frame.edges) {
      paintEdge(edge, showLabels);
    }
    for (const node of ordered) {
      if (!node.container) {
        const box = positions.get(node.id);
        if (box !== undefined) {
          paintNode(node, box, node.id === light);
        }
      }
    }
    context.globalAlpha = 1;
  };

  const tick = (now: number): void => {
    scheduled = 0;
    const moving = settlePositions(now);
    const panning = settleCamera(now);
    paint();
    if (moving || panning) {
      requestPaint();
    }
  };

  /** The node under a pixel: the smallest drawn last wins. */
  const hitTest = (pixel: Point): SceneNode | null => {
    if (frame === null) {
      return null;
    }
    const world = toWorld(camera, pixel, viewport);
    let best: SceneNode | null = null;
    for (const node of frame.nodes.values()) {
      const box = positions.get(node.id);
      if (
        box === undefined ||
        world.x < box.x ||
        world.x > box.x + box.width ||
        world.y < box.y ||
        world.y > box.y + box.height
      ) {
        continue;
      }
      if (
        best === null ||
        (best.container && (!node.container || node.depth > best.depth))
      ) {
        best = node;
      }
    }
    return best;
  };

  const pixelOf = (event: PointerEvent | WheelEvent | MouseEvent): Point => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const setHovered = (id: string | null): void => {
    if (hovered === id) {
      return;
    }
    hovered = id;
    const node = id === null ? undefined : frame?.nodes.get(id);
    canvas.title = node?.tooltip ?? "";
    canvas.style.cursor = node === undefined ? "grab" : "pointer";
    requestPaint();
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) {
      return;
    }
    canvas.setPointerCapture(event.pointerId);
    drag = {
      pointerId: event.pointerId,
      start: pixelOf(event),
      camera,
      moved: false,
    };
    cameraGlide = null;
  };

  const onPointerMove = (event: PointerEvent): void => {
    const pixel = pixelOf(event);
    if (drag === null || drag.pointerId !== event.pointerId) {
      setHovered(hitTest(pixel)?.id ?? null);
      return;
    }
    const dx = pixel.x - drag.start.x;
    const dy = pixel.y - drag.start.y;
    if (!drag.moved && Math.hypot(dx, dy) < dragThreshold) {
      return;
    }
    drag.moved = true;
    canvas.style.cursor = "grabbing";
    // The delta is measured in pixels against the camera at pointer-down,
    // so the moving view never feeds back into its own motion.
    camera = panCamera(drag.camera, dx, dy);
    cameraMoved = true;
    requestPaint();
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (drag === null || drag.pointerId !== event.pointerId) {
      return;
    }
    const { moved } = drag;
    drag = null;
    canvas.releasePointerCapture(event.pointerId);
    const hit = hitTest(pixelOf(event));
    setHovered(hit?.id ?? null);
    canvas.style.cursor = hit === null ? "grab" : "pointer";
    if (!moved) {
      callbacks.onSelect(hit?.id ?? null);
    }
  };

  const onDoubleClick = (event: MouseEvent): void => {
    const hit = hitTest(pixelOf(event));
    if (hit !== null) {
      callbacks.onActivate(hit.id);
    }
  };

  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    cameraGlide = null;
    cameraMoved = true;
    // A pinch arrives as a wheel with ctrl held; a two-finger scroll pans.
    if (event.ctrlKey || event.metaKey) {
      const factor = Math.exp(-event.deltaY * 0.01);
      camera = zoomCameraAt(camera, factor, pixelOf(event), viewport);
    } else {
      camera = panCamera(camera, -event.deltaX, -event.deltaY);
    }
    requestPaint();
  };

  const onPointerLeave = (): void => {
    if (drag === null) {
      setHovered(null);
    }
  };

  const resize = (): void => {
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    viewport = { width: rect.width, height: rect.height };
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    theme = readTheme(canvas);
    if (frame !== null && !cameraMoved) {
      camera = fitCamera(frame.fitTo, viewport);
    }
    requestPaint();
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("dblclick", onDoubleClick);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.style.cursor = "grab";

  return {
    setFrame: (next) => {
      const first = frame === null;
      frame = next;
      rebuildAdjacency();
      theme = readTheme(canvas);
      if (first) {
        positions = new Map(next.nodes);
        camera = fitCamera(next.fitTo, viewport);
        fitKey = next.fitKey;
      } else {
        glide = { from: positions, startedAt: performance.now() };
        if (next.fitKey !== fitKey) {
          fitKey = next.fitKey;
          cameraMoved = false;
          glideCameraTo(fitCamera(next.fitTo, viewport));
        }
      }
      if (hovered !== null && !next.nodes.has(hovered)) {
        setHovered(null);
      }
      requestPaint();
    },
    fit: () => {
      if (frame !== null) {
        cameraMoved = false;
        glideCameraTo(fitCamera(boundsOf(frame.nodes.values(), 48), viewport));
      }
    },
    zoomBy: (factor) => {
      cameraMoved = true;
      cameraGlide = null;
      camera = zoomCameraAt(
        camera,
        factor,
        { x: viewport.width / 2, y: viewport.height / 2 },
        viewport,
      );
      requestPaint();
    },
    resize,
    destroy: () => {
      if (scheduled !== 0) {
        cancelAnimationFrame(scheduled);
      }
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("dblclick", onDoubleClick);
      canvas.removeEventListener("wheel", onWheel);
    },
  };
};
