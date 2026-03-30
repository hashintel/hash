import type { Meta, StoryObj } from "@storybook/react";
import { useEffect, useRef } from "react";

import { calculatePolarDistanceToBorderMap } from "../../src/maps/polar-distance-to-border-map";

type Props = {
  radius: number;
};

const GeometricPolarMapVis = ({ radius }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const imageData = calculatePolarDistanceToBorderMap(radius);

    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext("2d")!;
    ctx.putImageData(imageData, 0, 0);
  }, [radius]);

  return (
    <div style={{ padding: 32, background: "#1a1a2e" }}>
      <p style={{ color: "#ccc", marginBottom: 8, fontFamily: "monospace" }}>
        Red = border distance ratio [0,1], Green = angle [0,2π] → [0,255]
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
  title: "Internals/Geometric Polar Map",
  component: GeometricPolarMapVis,
  argTypes: {
    radius: { control: { type: "range", min: 5, max: 100, step: 1 } },
  },
  args: {
    radius: 30,
  },
} satisfies Meta<typeof GeometricPolarMapVis>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Small: Story = {
  args: { radius: 10 },
};

export const Large: Story = {
  args: { radius: 80 },
};
