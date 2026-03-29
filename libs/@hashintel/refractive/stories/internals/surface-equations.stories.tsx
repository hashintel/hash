import type { Meta, StoryObj } from "@storybook/react";
import { useEffect, useRef } from "react";

import type { SurfaceFnDef } from "../../src/helpers/surface-equations";
import {
  concave,
  convex,
  convexCircle,
  lip,
} from "../../src/helpers/surface-equations";
import { calculateDisplacementMapRadius } from "../../src/maps/displacement-map";

const PLOT_WIDTH = 400;
const PLOT_HEIGHT = 300;
const PADDING = 40;

const equations: { name: string; fn: SurfaceFnDef; color: string }[] = [
  { name: "convex", fn: convex, color: "#4fc3f7" },
  { name: "convexCircle", fn: convexCircle, color: "#81c784" },
  { name: "concave", fn: concave, color: "#ff8a65" },
  { name: "lip", fn: lip, color: "#ce93d8" },
];

type Props = {
  glassThickness: number;
  bezelWidth: number;
  refractiveIndex: number;
  samples: number;
};

class PlotRenderer {
  private ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    const w = (PLOT_WIDTH + PADDING * 2) * 2;
    const h = (PLOT_HEIGHT + PADDING * 2) * 2;
    canvas.width = w; // eslint-disable-line no-param-reassign
    canvas.height = h; // eslint-disable-line no-param-reassign
    canvas.style.width = `${w / 2}px`; // eslint-disable-line no-param-reassign
    canvas.style.height = `${h / 2}px`; // eslint-disable-line no-param-reassign
    this.ctx = canvas.getContext("2d")!;
    this.ctx.scale(2, 2);
  }

  draw(
    title: string,
    getPoints: (fn: SurfaceFnDef) => [number, number][],
    centered = false,
  ) {
    const w = PLOT_WIDTH + PADDING * 2;
    const h = PLOT_HEIGHT + PADDING * 2;
    this.ctx.clearRect(0, 0, w, h);

    this.ctx.fillStyle = "#16213e";
    this.ctx.fillRect(PADDING, PADDING, PLOT_WIDTH, PLOT_HEIGHT);

    // Grid
    this.ctx.strokeStyle = "#2a2a4a";
    this.ctx.lineWidth = 0.5;
    for (let i = 0; i <= 10; i++) {
      const x = PADDING + (PLOT_WIDTH * i) / 10;
      const y = PADDING + (PLOT_HEIGHT * i) / 10;
      this.ctx.beginPath();
      this.ctx.moveTo(x, PADDING);
      this.ctx.lineTo(x, PADDING + PLOT_HEIGHT);
      this.ctx.stroke();
      this.ctx.beginPath();
      this.ctx.moveTo(PADDING, y);
      this.ctx.lineTo(PADDING + PLOT_WIDTH, y);
      this.ctx.stroke();
    }

    if (centered) {
      this.ctx.strokeStyle = "#555";
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      const zeroY = PADDING + PLOT_HEIGHT / 2;
      this.ctx.moveTo(PADDING, zeroY);
      this.ctx.lineTo(PADDING + PLOT_WIDTH, zeroY);
      this.ctx.stroke();
    }

    for (const eq of equations) {
      const points = getPoints(eq.fn);
      if (points.length === 0) {
        continue;
      }

      this.ctx.strokeStyle = eq.color;
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();

      for (let i = 0; i < points.length; i++) {
        const [px, py] = points[i]!;
        const x = PADDING + px * PLOT_WIDTH;
        const y = centered
          ? PADDING + PLOT_HEIGHT / 2 - (py * PLOT_HEIGHT) / 2
          : PADDING + PLOT_HEIGHT - py * PLOT_HEIGHT;

        if (i === 0) {
          this.ctx.moveTo(x, y);
        } else {
          this.ctx.lineTo(x, y);
        }
      }
      this.ctx.stroke();
    }

    // Title
    this.ctx.fillStyle = "#aaa";
    this.ctx.font = "13px monospace";
    this.ctx.textAlign = "center";
    this.ctx.fillText(title, w / 2, PADDING - 10);

    // Axis labels
    this.ctx.fillStyle = "#666";
    this.ctx.font = "11px monospace";
    this.ctx.textAlign = "left";
    this.ctx.fillText("0", PADDING - 2, PADDING + PLOT_HEIGHT + 14);
    this.ctx.textAlign = "right";
    this.ctx.fillText(
      "1",
      PADDING + PLOT_WIDTH + 2,
      PADDING + PLOT_HEIGHT + 14,
    );
  }
}

const SurfaceEquationsVis = ({
  glassThickness,
  bezelWidth,
  refractiveIndex,
  samples,
}: Props) => {
  const surfaceCanvasRef = useRef<HTMLCanvasElement>(null);
  const displacementCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const surfaceCanvas = surfaceCanvasRef.current;
    const displacementCanvas = displacementCanvasRef.current;
    if (!surfaceCanvas || !displacementCanvas) {
      return;
    }

    new PlotRenderer(surfaceCanvas).draw("Surface Shape: f(x)", (fn) => {
      const points: [number, number][] = [];
      for (let i = 0; i <= samples; i++) {
        const x = i / samples;
        points.push([x, fn(x)]);
      }
      return points;
    });

    new PlotRenderer(displacementCanvas).draw(
      "Displacement Radius (px)",
      (fn) => {
        const map = calculateDisplacementMapRadius(
          glassThickness,
          bezelWidth,
          fn,
          refractiveIndex,
          samples,
        );
        const maxVal = Math.max(...map.map(Math.abs), 1);
        return map.map(
          (v, i) => [i / map.length, v / maxVal] as [number, number],
        );
      },
      true,
    );
  }, [glassThickness, bezelWidth, refractiveIndex, samples]);

  return (
    <div
      style={{
        padding: 32,
        background: "#1a1a2e",
        display: "flex",
        flexDirection: "column",
        gap: 32,
      }}
    >
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {equations.map((eq) => (
          <span
            key={eq.name}
            style={{
              color: eq.color,
              fontFamily: "monospace",
              fontSize: 14,
            }}
          >
            {eq.name}
          </span>
        ))}
      </div>
      <canvas ref={surfaceCanvasRef} />
      <canvas ref={displacementCanvasRef} />
    </div>
  );
};

const meta = {
  title: "Internals/Surface Equations",
  component: SurfaceEquationsVis,
  argTypes: {
    glassThickness: {
      control: { type: "range" as const, min: 0, max: 300, step: 1 },
    },
    bezelWidth: {
      control: { type: "range" as const, min: 0, max: 100, step: 1 },
    },
    refractiveIndex: {
      control: { type: "range" as const, min: 1, max: 3, step: 0.01 },
    },
    samples: {
      control: { type: "range" as const, min: 16, max: 512, step: 16 },
    },
  },
  args: {
    glassThickness: 70,
    bezelWidth: 30,
    refractiveIndex: 1.5,
    samples: 128,
  },
} satisfies Meta<typeof SurfaceEquationsVis>;

export default meta;

type Story = StoryObj<typeof meta>;

export const AllCurves: Story = {};
