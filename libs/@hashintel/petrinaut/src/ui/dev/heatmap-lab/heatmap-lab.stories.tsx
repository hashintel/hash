/**
 * The heatmap lab: one place to compare renderers, density transforms,
 * smoothing, and colormaps over synthetic distributions that reproduce the
 * timeline's failure modes (black saturation, blocky aliasing, slow
 * per-rect drawing), and to benchmark the candidates.
 */
import { useEffect, useRef, useState } from "react";

import { colormapLut, COLORMAP_IDS } from "./colormaps";
import { buildDensityGrid } from "./density-grid";
import { LAB_DISTRIBUTION_IDS, labDistribution } from "./lab-distributions";
import { createRenderer, RENDERER_IDS } from "./renderers";

import type { ColormapId } from "./colormaps";
import type {
  DensityGrid,
  DensityNormalization,
  DensityTransform,
} from "./density-grid";
import type { LabDistributionId } from "./lab-distributions";
import type { HeatmapRenderer, RendererId } from "./renderers";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Dev / HeatmapLab",
  parameters: { layout: "centered" },
} satisfies Meta;

export default meta;

type LabArgs = {
  distribution: LabDistributionId;
  frames: number;
  runs: number;
  rows: number;
  transform: DensityTransform;
  normalization: DensityNormalization;
  smoothingSigma: number;
  colormap: ColormapId;
  smooth: boolean;
};

const labArgTypes = {
  distribution: { control: "select", options: LAB_DISTRIBUTION_IDS },
  frames: { control: { type: "number", min: 10, max: 500, step: 10 } },
  runs: { control: { type: "number", min: 8, max: 100_000, step: 1 } },
  rows: { control: { type: "number", min: 16, max: 512, step: 16 } },
  transform: {
    control: "select",
    options: ["linear", "sqrt", "log", "equalize"],
  },
  normalization: { control: "select", options: ["column", "global"] },
  smoothingSigma: { control: { type: "number", min: 0, max: 6, step: 0.5 } },
  colormap: { control: "select", options: COLORMAP_IDS },
  smooth: { control: "boolean" },
} as const;

const defaultLabArgs: LabArgs = {
  distribution: "heavy-tail",
  frames: 120,
  runs: 2_000,
  rows: 220,
  transform: "linear",
  normalization: "column",
  smoothingSigma: 0,
  colormap: "ink",
  smooth: false,
};

const WIDTH = 800;
const HEIGHT = 280;

/** Owns one renderer instance and reports each draw's main-thread cost. */
const RendererCanvas = ({
  rendererId,
  grid,
  colormap,
  smooth,
  onDrawMs,
}: {
  rendererId: RendererId;
  grid: DensityGrid;
  colormap: ColormapId;
  smooth: boolean;
  onDrawMs?: (ms: number) => void;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<HeatmapRenderer | null>(null);

  useEffect(() => {
    const renderer = createRenderer(rendererId);
    rendererRef.current = renderer;
    return () => {
      rendererRef.current = null;
      renderer.dispose();
    };
  }, [rendererId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer) {
      return;
    }
    const ratio = globalThis.devicePixelRatio || 1;
    canvas.width = Math.round(WIDTH * ratio);
    canvas.height = Math.round(HEIGHT * ratio);
    const lut = colormapLut(colormap);
    const started = performance.now();
    void Promise.resolve(
      renderer.draw(
        { canvas, width: canvas.width, height: canvas.height },
        grid,
        lut,
        { smooth },
      ),
    ).then(() => onDrawMs?.(performance.now() - started));
  }, [rendererId, grid, colormap, smooth, onDrawMs]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: WIDTH,
        height: HEIGHT,
        border: "1px solid #e5e7eb",
        borderRadius: 6,
        background: "#ffffff",
      }}
    />
  );
};

const captionStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#888",
  margin: 0,
  fontVariantNumeric: "tabular-nums",
};

const LabStory = (args: LabArgs & { renderer: RendererId }) => {
  const [drawMs, setDrawMs] = useState<number | null>(null);
  const [built, setBuilt] = useState<{
    grid: DensityGrid;
    buildMs: number;
  } | null>(null);

  // Timing is a side effect, so the measured build runs in an effect. The
  // story remounts per args change (keyed render), so this runs once.
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) {
        return;
      }
      const started = performance.now();
      const columns = labDistribution(
        args.distribution,
        args.frames,
        args.runs,
      );
      const grid = buildDensityGrid(columns, {
        rows: args.rows,
        transform: args.transform,
        normalization: args.normalization,
        smoothingSigma: args.smoothingSigma,
      });
      setBuilt({ grid, buildMs: performance.now() - started });
    });
    return () => {
      cancelled = true;
    };
  }, [
    args.distribution,
    args.frames,
    args.runs,
    args.rows,
    args.transform,
    args.normalization,
    args.smoothingSigma,
  ]);

  if (!built) {
    return null;
  }
  const { grid, buildMs } = built;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <RendererCanvas
        rendererId={args.renderer}
        grid={grid}
        colormap={args.colormap}
        smooth={args.smooth}
        onDrawMs={setDrawMs}
      />
      <p style={captionStyle}>
        {args.renderer} · grid {grid.columns}×{grid.rows} · build{" "}
        {buildMs.toFixed(1)} ms · draw{" "}
        {drawMs === null ? "…" : `${drawMs.toFixed(2)} ms`}
      </p>
    </div>
  );
};

export const Lab: StoryObj<LabArgs & { renderer: RendererId }> = {
  args: { ...defaultLabArgs, renderer: "raster" },
  argTypes: {
    ...labArgTypes,
    renderer: { control: "select", options: RENDERER_IDS },
  },
  render: (args) => <LabStory key={JSON.stringify(args)} {...args} />,
};

const CompareStory = (args: LabArgs) => {
  const [times, setTimes] = useState<Record<string, number>>({});
  const columns = labDistribution(args.distribution, args.frames, args.runs);
  const grid = buildDensityGrid(columns, {
    rows: args.rows,
    transform: args.transform,
    normalization: args.normalization,
    smoothingSigma: args.smoothingSigma,
  });

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 16,
        transform: "scale(0.62)",
        transformOrigin: "top left",
        width: WIDTH * 2 + 16,
      }}
    >
      {RENDERER_IDS.map((rendererId) => (
        <div
          key={rendererId}
          style={{ display: "flex", flexDirection: "column", gap: 4 }}
        >
          <RendererCanvas
            rendererId={rendererId}
            grid={grid}
            colormap={args.colormap}
            smooth={args.smooth}
            onDrawMs={(ms) =>
              setTimes((previous) =>
                previous[rendererId] === ms
                  ? previous
                  : { ...previous, [rendererId]: ms },
              )
            }
          />
          <p style={{ ...captionStyle, fontSize: 18 }}>
            {rendererId}
            {times[rendererId] === undefined
              ? ""
              : ` — ${times[rendererId]!.toFixed(2)} ms`}
          </p>
        </div>
      ))}
    </div>
  );
};

export const Compare: StoryObj<LabArgs> = {
  args: { ...defaultLabArgs, smooth: true, transform: "log" },
  argTypes: labArgTypes,
  render: (args) => <CompareStory key={JSON.stringify(args)} {...args} />,
};

type BenchmarkRow = {
  renderer: RendererId;
  mean: number;
  p95: number;
};

/** Draw each renderer repeatedly on the same grid; report main-thread cost. */
const BenchmarkStory = (args: LabArgs & { iterations: number }) => {
  const [rowsOut, setRowsOut] = useState<BenchmarkRow[] | null>(null);
  const [buildMs, setBuildMs] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const canvas = canvasRef.current!;
      const ratio = globalThis.devicePixelRatio || 1;
      canvas.width = Math.round(WIDTH * ratio);
      canvas.height = Math.round(HEIGHT * ratio);
      const columns = labDistribution(
        args.distribution,
        args.frames,
        args.runs,
      );
      const buildStart = performance.now();
      const grid = buildDensityGrid(columns, {
        rows: args.rows,
        transform: args.transform,
        normalization: args.normalization,
        smoothingSigma: args.smoothingSigma,
      });
      setBuildMs(performance.now() - buildStart);
      const lut = colormapLut(args.colormap);
      const results: BenchmarkRow[] = [];
      for (const rendererId of RENDERER_IDS) {
        const renderer = createRenderer(rendererId);
        // Each renderer gets its own canvas: a canvas that has handed out
        // a 2d context can never hand out a webgl2 one (and vice versa).
        const scratch = document.createElement("canvas");
        scratch.width = canvas.width;
        scratch.height = canvas.height;
        const target = {
          canvas: scratch,
          width: scratch.width,
          height: scratch.height,
        };
        const samples: number[] = [];
        for (let iteration = 0; iteration < args.iterations + 3; iteration++) {
          const started = performance.now();
          await renderer.draw(target, grid, lut, { smooth: args.smooth });
          const elapsed = performance.now() - started;
          if (iteration >= 3) {
            samples.push(elapsed); // first three are warmup
          }
          if (cancelled) {
            renderer.dispose();
            return;
          }
        }
        // Show this renderer's output on the visible canvas before moving
        // on, so the story confirms each renderer actually painted.
        const display = canvas.getContext("2d")!;
        display.clearRect(0, 0, canvas.width, canvas.height);
        display.drawImage(scratch, 0, 0);
        renderer.dispose();
        samples.sort((left, right) => left - right);
        results.push({
          renderer: rendererId,
          mean:
            samples.reduce((sum, sample) => sum + sample, 0) / samples.length,
          p95: samples[Math.floor(samples.length * 0.95)]!,
        });
      }
      if (!cancelled) {
        setRowsOut(results);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [
    args.distribution,
    args.frames,
    args.runs,
    args.rows,
    args.transform,
    args.normalization,
    args.smoothingSigma,
    args.colormap,
    args.smooth,
    args.iterations,
  ]);

  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 8, width: WIDTH }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: WIDTH,
          height: HEIGHT,
          border: "1px solid #e5e7eb",
          borderRadius: 6,
        }}
      />
      {rowsOut === null ? (
        <p style={captionStyle}>benchmarking…</p>
      ) : (
        <table
          style={{
            fontSize: 13,
            fontVariantNumeric: "tabular-nums",
            borderCollapse: "collapse",
          }}
        >
          <thead>
            <tr>
              {["renderer", "mean ms", "p95 ms"].map((header) => (
                <th
                  key={header}
                  style={{
                    textAlign: "left",
                    padding: "4px 12px 4px 0",
                    borderBottom: "1px solid #e5e7eb",
                  }}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowsOut.map((row) => (
              <tr key={row.renderer}>
                <td style={{ padding: "4px 12px 4px 0" }}>{row.renderer}</td>
                <td style={{ padding: "4px 12px 4px 0" }}>
                  {row.mean.toFixed(2)}
                </td>
                <td style={{ padding: "4px 12px 4px 0" }}>
                  {row.p95.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p style={captionStyle}>
        grid {args.frames}×{args.rows} · build {buildMs.toFixed(1)} ms ·
        main-thread cost per draw (webgl excludes GPU completion; raster-worker
        excludes the worker's off-thread time)
      </p>
    </div>
  );
};

export const Benchmark: StoryObj<LabArgs & { iterations: number }> = {
  args: { ...defaultLabArgs, frames: 300, rows: 256, iterations: 30 },
  argTypes: {
    ...labArgTypes,
    iterations: { control: { type: "number", min: 5, max: 200, step: 5 } },
  },
  render: (args) => <BenchmarkStory key={JSON.stringify(args)} {...args} />,
};
