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
import { calculatePolarDistanceMap } from "../../src/maps/polar-distance-map";

type Props = {
  radius: number;
  glassThickness: number;
  bezelWidth: number;
  refractiveIndex: number;
  bezelHeightFn: SurfaceFnDef;
  pixelRatio: number;
};

const PolarDistanceMapVis = ({
  radius,
  glassThickness,
  bezelWidth,
  refractiveIndex,
  bezelHeightFn,
  pixelRatio,
}: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const cornerWidth = Math.max(radius, bezelWidth);
    const imageSide = cornerWidth * 2 + 1;

    const map = calculateDisplacementMapRadius(
      glassThickness,
      bezelWidth,
      bezelHeightFn,
      refractiveIndex,
    );

    const imageData = calculatePolarDistanceMap({
      width: imageSide,
      height: imageSide,
      radius,
      bezelWidth,
      precomputedDisplacementMap: map,
      pixelRatio,
    });

    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext("2d")!;
    ctx.putImageData(imageData, 0, 0);
  }, [
    radius,
    glassThickness,
    bezelWidth,
    refractiveIndex,
    bezelHeightFn,
    pixelRatio,
  ]);

  return (
    <div style={{ padding: 32, background: "#1a1a2e" }}>
      <p style={{ color: "#ccc", marginBottom: 8, fontFamily: "monospace" }}>
        Red = distance (px), Green = angle (0-2pi mapped to 0-255)
      </p>
      <canvas
        ref={canvasRef}
        style={{
          imageRendering: "pixelated",
          width: 500,
          height: 500,
          border: "1px solid #444",
        }}
      />
    </div>
  );
};

const meta = {
  title: "Internals/Polar Distance Map",
  component: PolarDistanceMapVis,
  argTypes: {
    radius: { control: { type: "range", min: 0, max: 100, step: 1 } },
    glassThickness: { control: { type: "range", min: 0, max: 300, step: 1 } },
    bezelWidth: { control: { type: "range", min: 0, max: 100, step: 1 } },
    refractiveIndex: {
      control: { type: "range", min: 1, max: 3, step: 0.01 },
    },
    pixelRatio: { control: { type: "range", min: 1, max: 12, step: 1 } },
    bezelHeightFn: { table: { disable: true } },
  },
  args: {
    radius: 20,
    glassThickness: 70,
    bezelWidth: 30,
    refractiveIndex: 1.5,
    pixelRatio: 6,
    bezelHeightFn: convex,
  },
} satisfies Meta<typeof PolarDistanceMapVis>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Convex: Story = { args: { bezelHeightFn: convex } };
export const ConvexCircle: Story = { args: { bezelHeightFn: convexCircle } };
export const Concave: Story = { args: { bezelHeightFn: concave } };
export const Lip: Story = { args: { bezelHeightFn: lip } };
