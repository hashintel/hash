import type { Meta, StoryObj } from "@storybook/react";
import { useEffect, useRef } from "react";

import type { SurfaceFnDef } from "../../src/helpers/surface-equations";
import {
  CONCAVE,
  CONVEX,
  CONVEX_CIRCLE,
  LIP,
} from "../../src/helpers/surface-equations";
import {
  calculateDisplacementMap,
  calculateDisplacementMapRadius,
} from "../../src/maps/displacement-map";

type Props = {
  radius: number;
  glassThickness: number;
  bezelWidth: number;
  refractiveIndex: number;
  bezelHeightFn: SurfaceFnDef;
  pixelRatio: number;
};

const DisplacementMapVis = ({
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
    const maximumDisplacement = Math.max(...map.map(Math.abs));

    const imageData = calculateDisplacementMap({
      width: imageSide,
      height: imageSide,
      radius,
      bezelWidth,
      precomputedDisplacementMap: map,
      maximumDisplacement,
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
        Red = X displacement, Green = Y displacement (128 = neutral)
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
  title: "Internals/Displacement Map",
  component: DisplacementMapVis,
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
    bezelHeightFn: CONVEX,
  },
} satisfies Meta<typeof DisplacementMapVis>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Convex: Story = { args: { bezelHeightFn: CONVEX } };
export const ConvexCircle: Story = { args: { bezelHeightFn: CONVEX_CIRCLE } };
export const Concave: Story = { args: { bezelHeightFn: CONCAVE } };
export const Lip: Story = { args: { bezelHeightFn: LIP } };
