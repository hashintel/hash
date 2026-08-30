/**
 * The raster-worker renderer's worker: turns a density grid into RGBA
 * pixels off the main thread. The buffers travel as transferables, so the
 * main thread's remaining cost is one putImageData and one drawImage.
 */
import { rasterizeGrid } from "./renderers";

type Request = {
  id: number;
  densities: Float32Array;
  columns: number;
  rows: number;
  lut: Uint8ClampedArray;
};

self.addEventListener("message", (event: MessageEvent<Request>) => {
  const { id, densities, columns, rows, lut } = event.data;
  const pixels = rasterizeGrid(
    { densities, columns, rows, valueMin: 0, valueMax: 1 },
    lut,
  );
  self.postMessage({ id, pixels }, { transfer: [pixels.buffer] });
});
