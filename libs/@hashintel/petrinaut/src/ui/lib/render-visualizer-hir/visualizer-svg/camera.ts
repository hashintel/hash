import type { VisualizerSvgOptions } from "@hashintel/petrinaut-core";

export type Size = { width: number; height: number };
export type Point = { x: number; y: number };
export type Camera = Point & { zoom: number };

export const fitCamera = (
  options: VisualizerSvgOptions,
  size: Size,
): Camera => {
  if (options.viewBox) {
    const { x, y, width, height } = options.viewBox;
    return {
      x: x + width / 2,
      y: y + height / 2,
      zoom: Math.min(size.width / width, size.height / height),
    };
  }
  return {
    x: options.origin === "center" ? 0 : size.width / 2,
    y: options.origin === "center" ? 0 : size.height / 2,
    zoom: 1,
  };
};

export const panCamera = (camera: Camera, delta: Point): Camera => ({
  ...camera,
  x: camera.x - delta.x / camera.zoom,
  y: camera.y - delta.y / camera.zoom,
});

export const zoomCamera = (
  camera: Camera,
  factor: number,
  anchor: Point,
  size: Size,
  homeZoom = 1,
): Camera => {
  const zoom = Math.max(
    Math.min(camera.zoom, homeZoom * 0.01),
    Math.min(Math.max(camera.zoom, homeZoom * 1000), camera.zoom * factor),
  );
  const offset = {
    x: anchor.x - size.width / 2,
    y: anchor.y - size.height / 2,
  };
  return {
    zoom,
    x: camera.x + offset.x * (1 / camera.zoom - 1 / zoom),
    y: camera.y + offset.y * (1 / camera.zoom - 1 / zoom),
  };
};

export const cameraViewBox = (camera: Camera, size: Size): string => {
  const width = size.width / camera.zoom;
  const height = size.height / camera.zoom;
  return `${camera.x - width / 2} ${camera.y - height / 2} ${width} ${height}`;
};

export const pointerFrame = (
  points: ReadonlyMap<number, Point>,
): { center: Point; distance: number } | null => {
  const [first, second] = [...points.values()];
  if (!first) return null;
  if (!second) return { center: first, distance: 0 };
  return {
    center: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
    distance: Math.hypot(second.x - first.x, second.y - first.y),
  };
};

export const camerasMatch = (camera: Camera, other: Camera): boolean =>
  Math.abs(camera.x - other.x) * camera.zoom < 0.01 &&
  Math.abs(camera.y - other.y) * camera.zoom < 0.01 &&
  Math.abs(Math.log(camera.zoom / other.zoom)) < 0.000001;

export const interpolateCamera = (
  from: Camera,
  to: Camera,
  progress: number,
): Camera => {
  const eased = 1 - (1 - progress) ** 3;
  return {
    x: from.x + (to.x - from.x) * eased,
    y: from.y + (to.y - from.y) * eased,
    zoom: from.zoom * (to.zoom / from.zoom) ** eased,
  };
};
