/**
 * The lab's candidate heatmap renderers, all drawing the same `DensityGrid`
 * through the same colormap so only the painting strategy differs:
 *
 * - `rects` — the timeline's current strategy: one `fillRect` and one
 *   `fillStyle` string per cell. The control the others race against.
 * - `raster` — one RGBA pixel per grid cell into an offscreen canvas via
 *   `putImageData`, upscaled to the target in one `drawImage`. With image
 *   smoothing on, the browser's (GPU-composited) bilinear filter does the
 *   interpolation.
 * - `raster-worker` — the same raster composed in a Web Worker; the main
 *   thread only receives the pixel buffer and draws it. Same pixels as
 *   `raster`, main-thread cost reduced to the blit.
 * - `webgl` — the grid as an R8 texture sampled with LINEAR filtering, the
 *   colormap as a 256×1 LUT texture, one full-screen triangle.
 */
import type { DensityGrid } from "./density-grid";

export type RendererId = "rects" | "raster" | "raster-worker" | "webgl";

export const RENDERER_IDS: readonly RendererId[] = [
  "rects",
  "raster",
  "raster-worker",
  "webgl",
];

export type DrawTarget = {
  canvas: HTMLCanvasElement;
  /** Device-pixel size the canvas is already sized to. */
  width: number;
  height: number;
};

export type DrawOptions = {
  /** Bilinear-filter the upscale (raster/webgl); false keeps hard cells. */
  smooth: boolean;
};

export type HeatmapRenderer = {
  id: RendererId;
  draw(
    target: DrawTarget,
    grid: DensityGrid,
    lut: Uint8ClampedArray,
    options: DrawOptions,
  ): Promise<void> | void;
  dispose(): void;
};

// -- rects (control) ----------------------------------------------------------

function createRectsRenderer(): HeatmapRenderer {
  return {
    id: "rects",
    draw(target, grid, lut) {
      const context = target.canvas.getContext("2d")!;
      context.clearRect(0, 0, target.width, target.height);
      const cellWidth = target.width / grid.columns;
      const cellHeight = target.height / grid.rows;
      for (let row = 0; row < grid.rows; row++) {
        for (let column = 0; column < grid.columns; column++) {
          const density = grid.densities[row * grid.columns + column]!;
          if (density <= 0) {
            continue;
          }
          const entry = Math.min(255, Math.round(density * 255)) * 4;
          context.fillStyle = `rgba(${lut[entry]}, ${lut[entry + 1]}, ${lut[entry + 2]}, ${lut[entry + 3]! / 255})`;
          context.fillRect(
            column * cellWidth,
            target.height - (row + 1) * cellHeight,
            cellWidth + 1,
            cellHeight + 1,
          );
        }
      }
    },
    dispose() {},
  };
}

// -- raster -------------------------------------------------------------------

/** The grid as cell-resolution RGBA pixels (row 0 at the image top). */
export function rasterizeGrid(
  grid: DensityGrid,
  lut: Uint8ClampedArray,
): Uint8ClampedArray<ArrayBuffer> {
  const pixels = new Uint8ClampedArray(grid.columns * grid.rows * 4);
  for (let row = 0; row < grid.rows; row++) {
    const imageRow = grid.rows - 1 - row;
    for (let column = 0; column < grid.columns; column++) {
      const density = grid.densities[row * grid.columns + column]!;
      const entry = Math.min(255, Math.round(density * 255)) * 4;
      const out = (imageRow * grid.columns + column) * 4;
      pixels[out] = lut[entry]!;
      pixels[out + 1] = lut[entry + 1]!;
      pixels[out + 2] = lut[entry + 2]!;
      pixels[out + 3] = lut[entry + 3]!;
    }
  }
  return pixels;
}

function blitRaster(
  target: DrawTarget,
  grid: DensityGrid,
  pixels: Uint8ClampedArray<ArrayBuffer>,
  smooth: boolean,
  cellCanvas: HTMLCanvasElement,
): void {
  /* eslint-disable no-param-reassign -- resizing the caller-owned scratch
     canvas to the grid is this function's contract. */
  cellCanvas.width = grid.columns;
  cellCanvas.height = grid.rows;
  /* eslint-enable no-param-reassign */
  const cellContext = cellCanvas.getContext("2d")!;
  cellContext.putImageData(
    new ImageData(pixels, grid.columns, grid.rows),
    0,
    0,
  );
  const context = target.canvas.getContext("2d")!;
  context.clearRect(0, 0, target.width, target.height);
  context.imageSmoothingEnabled = smooth;
  context.imageSmoothingQuality = "high";
  context.drawImage(cellCanvas, 0, 0, target.width, target.height);
}

function createRasterRenderer(): HeatmapRenderer {
  const cellCanvas = document.createElement("canvas");
  return {
    id: "raster",
    draw(target, grid, lut, options) {
      blitRaster(
        target,
        grid,
        rasterizeGrid(grid, lut),
        options.smooth,
        cellCanvas,
      );
    },
    dispose() {},
  };
}

// -- raster in a worker -------------------------------------------------------

type WorkerReply = { id: number; pixels: Uint8ClampedArray<ArrayBuffer> };

function createRasterWorkerRenderer(): HeatmapRenderer {
  const worker = new Worker(new URL("./raster.worker.ts", import.meta.url), {
    type: "module",
  });
  const cellCanvas = document.createElement("canvas");
  let nextRequest = 1;
  return {
    id: "raster-worker",
    draw(target, grid, lut, options) {
      const id = nextRequest++;
      const densities = grid.densities.slice();
      return new Promise<void>((resolve) => {
        const onMessage = (event: MessageEvent<WorkerReply>) => {
          if (event.data.id !== id) {
            return;
          }
          worker.removeEventListener("message", onMessage);
          blitRaster(
            target,
            grid,
            event.data.pixels,
            options.smooth,
            cellCanvas,
          );
          resolve();
        };
        worker.addEventListener("message", onMessage);
        worker.postMessage(
          {
            id,
            densities,
            columns: grid.columns,
            rows: grid.rows,
            lut: lut.slice(),
          },
          [densities.buffer],
        );
      });
    },
    dispose() {
      worker.terminate();
    },
  };
}

// -- webgl --------------------------------------------------------------------

const VERTEX_SHADER = `#version 300 es
void main() {
  // One full-screen triangle from gl_VertexID; no vertex buffers.
  vec2 corners[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
  gl_Position = vec4(corners[gl_VertexID], 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D grid;
uniform sampler2D lut;
uniform vec2 size;
out vec4 color;
void main() {
  // gl_FragCoord.y already grows upward, matching grid row 0 = valueMin
  // at texture v = 0, so no vertical flip.
  vec2 uv = gl_FragCoord.xy / size;
  float density = texture(grid, uv).r;
  color = texture(lut, vec2(density, 0.5));
  color.rgb *= color.a; // premultiplied alpha for correct compositing
}`;

function compileProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) ?? "shader compile failed");
    }
    return shader;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX_SHADER));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? "program link failed");
  }
  return program;
}

function createWebglRenderer(): HeatmapRenderer {
  let gl: WebGL2RenderingContext | null = null;
  let program: WebGLProgram | null = null;
  let gridTexture: WebGLTexture | null = null;
  let lutTexture: WebGLTexture | null = null;
  let boundCanvas: HTMLCanvasElement | null = null;

  const setup = (canvas: HTMLCanvasElement, smooth: boolean) => {
    boundCanvas = canvas;
    gl = canvas.getContext("webgl2", { premultipliedAlpha: true });
    if (!gl) {
      return;
    }
    program = compileProgram(gl);
    gridTexture = gl.createTexture();
    lutTexture = gl.createTexture();
    for (const [texture, filter] of [
      [gridTexture, smooth ? gl.LINEAR : gl.NEAREST],
      [lutTexture, gl.LINEAR],
    ] as const) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
  };

  return {
    id: "webgl",
    draw(target, grid, lut, options) {
      if (!gl || boundCanvas !== target.canvas || gl.isContextLost()) {
        setup(target.canvas, options.smooth);
      }
      if (!gl) {
        // WebGL2 can be unavailable (context limit, blocklisted GPU,
        // headless without a GL flag); say so instead of crashing.
        const fallback = target.canvas.getContext("2d");
        if (fallback) {
          fallback.clearRect(0, 0, target.width, target.height);
          fallback.fillStyle = "#9ca3af";
          fallback.font = "24px sans-serif";
          fallback.fillText("webgl2 unavailable", 16, 40);
        }
        return;
      }
      const context = gl;
      // R8 density texture: LINEAR filtering on 8-bit textures is core
      // WebGL2, unlike float textures which need an extension.
      const bytes = new Uint8Array(grid.columns * grid.rows);
      for (let row = 0; row < grid.rows; row++) {
        for (let column = 0; column < grid.columns; column++) {
          bytes[row * grid.columns + column] = Math.min(
            255,
            Math.round(grid.densities[row * grid.columns + column]! * 255),
          );
        }
      }
      context.pixelStorei(context.UNPACK_ALIGNMENT, 1);
      context.activeTexture(context.TEXTURE0);
      context.bindTexture(context.TEXTURE_2D, gridTexture);
      context.texImage2D(
        context.TEXTURE_2D,
        0,
        context.R8,
        grid.columns,
        grid.rows,
        0,
        context.RED,
        context.UNSIGNED_BYTE,
        bytes,
      );
      context.activeTexture(context.TEXTURE1);
      context.bindTexture(context.TEXTURE_2D, lutTexture);
      context.texImage2D(
        context.TEXTURE_2D,
        0,
        context.RGBA,
        256,
        1,
        0,
        context.RGBA,
        context.UNSIGNED_BYTE,
        new Uint8Array(lut.buffer.slice(0)),
      );

      context.viewport(0, 0, target.width, target.height);
      context.clearColor(0, 0, 0, 0);
      context.clear(context.COLOR_BUFFER_BIT);
      context.useProgram(program);
      context.uniform1i(context.getUniformLocation(program!, "grid"), 0);
      context.uniform1i(context.getUniformLocation(program!, "lut"), 1);
      context.uniform2f(
        context.getUniformLocation(program!, "size"),
        target.width,
        target.height,
      );
      context.drawArrays(context.TRIANGLES, 0, 3);
    },
    dispose() {
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
      gl = null;
    },
  };
}

export function createRenderer(id: RendererId): HeatmapRenderer {
  switch (id) {
    case "rects":
      return createRectsRenderer();
    case "raster":
      return createRasterRenderer();
    case "raster-worker":
      return createRasterWorkerRenderer();
    case "webgl":
      return createWebglRenderer();
  }
}
