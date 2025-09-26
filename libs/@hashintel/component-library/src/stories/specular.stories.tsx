import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useRef } from "react";

import { calculateRefractionSpecular } from "../lib/specular";

// Define the args type for the specular function parameters
interface SpecularArgs {
  objectWidth: number;
  objectHeight: number;
  radius: number;
  bezelWidth: number;
  specularAngle: number;
  dpr: number;
}

// Specular visualization story
const meta: Meta<SpecularArgs> = {
  title: "Specular/Refraction Visualization",
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: `
# Specular Refraction Visualization

This story demonstrates the \`calculateRefractionSpecular\` function which generates
specular reflection patterns for glass-like surfaces. The function creates an ImageData
object that can be rendered on a canvas to show realistic lighting effects.

## Parameters

- **Object Dimensions**: Width and height of the object
- **Radius**: Corner radius for rounded shapes
- **Bezel Width**: Width of the bezel frame around the object
- **Specular Angle**: Angle of the light source in radians
- **Device Pixel Ratio**: Scale factor for high-DPI displays

Use the controls below to adjust the parameters and see how they affect the specular pattern.
        `,
      },
    },
  },
  argTypes: {
    objectWidth: {
      control: {
        type: "range",
        min: 100,
        max: 600,
        step: 10,
      },
      description: "Width of the object in pixels",
    },
    objectHeight: {
      control: {
        type: "range",
        min: 100,
        max: 400,
        step: 10,
      },
      description: "Height of the object in pixels",
    },
    radius: {
      control: {
        type: "range",
        min: 0,
        max: 50,
        step: 1,
      },
      description: "Corner radius of the object",
    },
    bezelWidth: {
      control: {
        type: "range",
        min: 1,
        max: 50,
        step: 1,
      },
      description: "Width of the bezel frame",
    },
    specularAngle: {
      control: {
        type: "range",
        min: 0,
        max: Math.PI * 2,
        step: 0.1,
      },
      description: "Specular angle in radians (0 to 2π)",
    },
  },
  args: {
    objectWidth: 300,
    objectHeight: 200,
    radius: 20,
    bezelWidth: 16,
    specularAngle: Math.PI / 3,
  },
};

// eslint-disable-next-line import/no-default-export
export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Visualizes the specular refraction calculation on a canvas.
 * Use the controls to adjust the parameters and see how they affect the specular pattern.
 */
export const SpecularVisualization: Story = {
  render: (args: SpecularArgs) => {
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
      canvas.width = args.objectWidth;
      canvas.height = args.objectHeight;

      try {
        const dpr = 2;

        // Calculate the specular pattern
        const imageData = calculateRefractionSpecular(
          args.objectWidth,
          args.objectHeight,
          args.radius,
          args.bezelWidth,
          args.specularAngle,
          dpr
        );

        // Scale the ImageData if needed due to device pixel ratio
        const scaledCanvas = document.createElement("canvas");
        const scaledCtx = scaledCanvas.getContext("2d");
        if (!scaledCtx) {
          return;
        }

        scaledCanvas.width = Math.round(args.objectWidth * dpr);
        scaledCanvas.height = Math.round(args.objectHeight * dpr);

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
          "Error calculating specular",
          canvas.width / 2,
          canvas.height / 2
        );
        // Log error for debugging
        // eslint-disable-next-line no-console
        console.error("Specular calculation error:", error);
      }
    }, [
      args.objectWidth,
      args.objectHeight,
      args.radius,
      args.bezelWidth,
      args.specularAngle,
    ]);

    return (
      <div style={{ padding: "2rem", textAlign: "center" }}>
        <h3>Specular Preview</h3>
        <canvas
          ref={canvasRef}
          style={{
            maxWidth: "100%",
            height: "auto",
            backgroundColor: "#000",
            padding: 40,
            borderRadius: 4,
          }}
        />
        <div style={{ marginTop: "1rem", fontSize: "14px", color: "#666" }}>
          <p>
            Canvas: {args.objectWidth} × {args.objectHeight}px
          </p>
          <p>
            Radius: {args.radius}px, Bezel: {args.bezelWidth}px
          </p>
          <p>
            Specular Angle: {((args.specularAngle * 180) / Math.PI).toFixed(1)}°
          </p>
          <p>Device Pixel Ratio: {args.dpr}</p>
        </div>
      </div>
    );
  },
};
