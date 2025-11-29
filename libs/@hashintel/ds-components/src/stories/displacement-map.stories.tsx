import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useRef } from "react";

import {
  calculateDisplacementMap,
  calculateDisplacementMapRadius,
} from "../../../refractive/src/maps/displacement-map";
import {
  CONCAVE,
  CONVEX,
  LIP,
  type SurfaceFnDef,
} from "../../../refractive/src/surface-equations";

type BezelHeightType = "CONVEX" | "CONCAVE" | "LIP";

interface DisplacementMapArgs {
  width: number;
  height: number;
  radius: number;
  bezelWidth: number;
  maximumDisplacement: number;
  glassThickness: number;
  refractiveIndex: number;
  bezelHeightFn: BezelHeightType;
  dpr: number;
}

const meta: Meta<DisplacementMapArgs> = {
  title: "Internals/Displacement Map",
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: `
# Displacement Map Visualization

This story demonstrates the \`calculateDisplacementMap\` function which generates
displacement maps for glass-like surfaces with refractive effects. The function creates
an ImageData object that can be rendered on a canvas to show realistic refraction patterns.

## Parameters

- **Object Dimensions**: Width and height of the object
- **Radius**: Corner radius for rounded shapes
- **Bezel Width**: Width of the bezel/edge area where refraction occurs
- **Maximum Displacement**: Maximum pixel displacement for the refraction effect
- **Glass Thickness**: Thickness of the glass material (affects refraction calculation)
- **Refractive Index**: Index of refraction for the material (e.g., 1.5 for glass)

Use the controls below to adjust the parameters and see how they affect the displacement pattern.
        `,
      },
    },
  },
  argTypes: {
    width: {
      name: "Width",
      control: {
        type: "range",
        min: 100,
        max: 600,
        step: 10,
      },
      description: "Width of the object in pixels",
    },
    height: {
      name: "Height",
      control: {
        type: "range",
        min: 100,
        max: 400,
        step: 10,
      },
      description: "Height of the object in pixels",
    },
    radius: {
      name: "Radius",
      control: {
        type: "range",
        min: 0,
        max: 100,
        step: 1,
      },
      description: "Corner radius of the object",
    },
    bezelWidth: {
      name: "Bezel Width",
      control: {
        type: "range",
        min: 1,
        max: 100,
        step: 1,
      },
      description: "Width of the bezel area where refraction occurs",
    },
    glassThickness: {
      name: "Glass Thickness",
      control: {
        type: "range",
        min: 50,
        max: 400,
        step: 10,
      },
      description: "Thickness of the glass material",
    },
    refractiveIndex: {
      name: "Refractive Index",
      control: {
        type: "range",
        min: 1.0,
        max: 2.5,
        step: 0.1,
      },
      description: "Index of refraction (1.5 for glass, 1.33 for water)",
    },
    bezelHeightFn: {
      name: "Bezel Height Function",
      control: {
        type: "select",
      },
      options: ["CONVEX", "CONCAVE", "LIP"],
      description: "Shape of the bezel profile",
    },
  },
  args: {
    width: 300,
    height: 200,
    radius: 20,
    bezelWidth: 50,
    maximumDisplacement: 20,
    glassThickness: 200,
    refractiveIndex: 1.5,
    bezelHeightFn: "CONVEX",
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

const bezelHeightFunctions: Record<BezelHeightType, SurfaceFnDef> = {
  CONVEX,
  CONCAVE,
  LIP,
};

/**
 * Visualizes only the rendered displacement map on a canvas.
 * Use the controls to adjust the parameters and see how they affect the displacement pattern.
 */
export const Preview: Story = {
  render: (args: DisplacementMapArgs) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }

      // Set canvas size to match the object dimensions
      canvas.width = args.width;
      canvas.height = args.height;

      try {
        // Get the selected bezel height function
        const bezelHeightFn = bezelHeightFunctions[args.bezelHeightFn];

        // Pre-compute the displacement map radius
        const precomputedDisplacementMap = calculateDisplacementMapRadius(
          args.glassThickness,
          args.bezelWidth,
          bezelHeightFn,
          args.refractiveIndex,
          128,
        );

        const maximumDisplacement = Math.max(
          ...precomputedDisplacementMap.map(Math.abs),
        );

        // Calculate the displacement map pattern
        const imageData = calculateDisplacementMap({
          width: args.width,
          height: args.height,
          radius: args.radius,
          bezelWidth: args.bezelWidth,
          maximumDisplacement,
          precomputedDisplacementMap,
          pixelRatio: 2,
        });

        // Scale the ImageData if needed due to device pixel ratio
        const scaledCanvas = document.createElement("canvas");
        const scaledCtx = scaledCanvas.getContext("2d");
        if (!scaledCtx) {
          return;
        }

        scaledCanvas.width = imageData.width;
        scaledCanvas.height = imageData.height;

        scaledCtx.putImageData(imageData as ImageData, 0, 0);

        // Draw the scaled result to the main canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(scaledCanvas, 0, 0, canvas.width, canvas.height);
      } catch (error) {
        // Handle any errors in calculation
        ctx.fillStyle = "#ff0000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#ffffff";
        ctx.font = "16px Arial";
        ctx.textAlign = "center";
        ctx.fillText(
          "Error calculating displacement map",
          canvas.width / 2,
          canvas.height / 2,
        );
        // Log error for debugging
        // eslint-disable-next-line no-console
        console.error("Displacement map calculation error:", error);
      }
    }, [
      args.width,
      args.height,
      args.radius,
      args.bezelWidth,
      args.maximumDisplacement,
      args.glassThickness,
      args.refractiveIndex,
      args.bezelHeightFn,
    ]);

    return (
      <div
        style={{
          textAlign: "center",
          backgroundColor: "#808000",
          borderRadius: 20,
          padding: 70,
        }}
      >
        <canvas ref={canvasRef} style={{ maxWidth: "100%", height: "auto" }} />
      </div>
    );
  },
};
