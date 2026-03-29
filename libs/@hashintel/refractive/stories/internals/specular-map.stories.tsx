import type { Meta, StoryObj } from "@storybook/react";
import { useEffect, useRef } from "react";

import { calculateSpecularImage } from "../../src/maps/specular";

type Props = {
  radius: number;
  specularAngle: number;
  pixelRatio: number;
};

const SpecularMapVis = ({ radius, specularAngle, pixelRatio }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const imageSide = radius * 2 + 1;

    const imageData = calculateSpecularImage({
      width: imageSide,
      height: imageSide,
      radius,
      specularAngle,
      pixelRatio,
    });

    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext("2d")!;
    ctx.putImageData(imageData, 0, 0);
  }, [radius, specularAngle, pixelRatio]);

  return (
    <div style={{ padding: 32, background: "#1a1a2e" }}>
      <p style={{ color: "#ccc", marginBottom: 8, fontFamily: "monospace" }}>
        RGB = brightness, Alpha = specular intensity
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
  title: "Internals/Specular Map",
  component: SpecularMapVis,
  argTypes: {
    radius: { control: { type: "range", min: 5, max: 100, step: 1 } },
    specularAngle: {
      control: { type: "range", min: 0, max: 6.28, step: 0.01 },
    },
    pixelRatio: { control: { type: "range", min: 1, max: 12, step: 1 } },
  },
  args: {
    radius: 40,
    specularAngle: Math.PI / 4,
    pixelRatio: 6,
  },
} satisfies Meta<typeof SpecularMapVis>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const TopLight: Story = {
  args: { specularAngle: Math.PI / 2 },
};

export const SideLight: Story = {
  args: { specularAngle: 0 },
};
