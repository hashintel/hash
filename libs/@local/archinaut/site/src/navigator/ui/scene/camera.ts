/**
 * The camera: a point of the map at the centre of the canvas and a zoom in
 * pixels per map unit. Fitting a box, panning by pixels and zooming about
 * a pointer are the three moves, each a pure function of a camera.
 */

import type { Box, Point } from "../../model/layout/types";

export interface Camera {
  centerX: number;
  centerY: number;
  /** Canvas pixels per map unit. */
  zoom: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export const minZoom = 0.05;
export const maxZoom = 6;

const clampZoom = (zoom: number): number =>
  Math.min(maxZoom, Math.max(minZoom, zoom));

/** The camera that shows all of `box`, centred. */
export const fitCamera = (box: Box, viewport: Viewport): Camera => ({
  centerX: box.x + box.width / 2,
  centerY: box.y + box.height / 2,
  zoom: clampZoom(
    Math.min(viewport.width / box.width, viewport.height / box.height),
  ),
});

export const panCamera = (
  camera: Camera,
  dxPixels: number,
  dyPixels: number,
): Camera => ({
  ...camera,
  centerX: camera.centerX - dxPixels / camera.zoom,
  centerY: camera.centerY - dyPixels / camera.zoom,
});

/** Zooms by `factor`, keeping the map point under `pixel` where it is. */
export const zoomCameraAt = (
  camera: Camera,
  factor: number,
  pixel: Point,
  viewport: Viewport,
): Camera => {
  const zoom = clampZoom(camera.zoom * factor);
  const ratio = camera.zoom / zoom;
  const world = toWorld(camera, pixel, viewport);
  return {
    zoom,
    centerX: world.x - (world.x - camera.centerX) * ratio,
    centerY: world.y - (world.y - camera.centerY) * ratio,
  };
};

export const toWorld = (
  camera: Camera,
  pixel: Point,
  viewport: Viewport,
): Point => ({
  x: camera.centerX + (pixel.x - viewport.width / 2) / camera.zoom,
  y: camera.centerY + (pixel.y - viewport.height / 2) / camera.zoom,
});

export const toPixel = (
  camera: Camera,
  world: Point,
  viewport: Viewport,
): Point => ({
  x: (world.x - camera.centerX) * camera.zoom + viewport.width / 2,
  y: (world.y - camera.centerY) * camera.zoom + viewport.height / 2,
});

/** Between two cameras, with the zoom interpolated in log space so it feels even. */
export const mixCamera = (from: Camera, to: Camera, t: number): Camera => ({
  centerX: from.centerX + (to.centerX - from.centerX) * t,
  centerY: from.centerY + (to.centerY - from.centerY) * t,
  zoom: Math.exp(
    Math.log(from.zoom) + (Math.log(to.zoom) - Math.log(from.zoom)) * t,
  ),
});
