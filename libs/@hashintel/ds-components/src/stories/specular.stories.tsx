import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useRef } from "react";

import { calculateSpecularImage } from "../../../refractive/src/maps/specular";

// Define the args type for the specular function parameters
interface SpecularArgs {
  width: number;
  height: number;
  radius: number;
  specularAngle: number;
  dpr: number;
}

const meta: Meta<SpecularArgs> = {
  title: "Internals/Specular",
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
- **Specular Angle**: Angle of the light source in radians

Use the controls below to adjust the parameters and see how they affect the specular pattern.
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
        max: 50,
        step: 1,
      },
      description: "Corner radius of the object",
    },
    specularAngle: {
      name: "Specular Angle",
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
    width: 300,
    height: 200,
    radius: 20,
    specularAngle: Math.PI / 3,
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Visualizes only the rendered specular on a canvas.
 * Use the controls to adjust the parameters and see how they affect the specular pattern.
 */
export const Preview: Story = {
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
      canvas.width = args.width;
      canvas.height = args.height;

      try {
        // Calculate the specular pattern
        const imageData = calculateSpecularImage({
          width: args.width,
          height: args.height,
          radius: args.radius,
          specularAngle: args.specularAngle,
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
          "Error calculating specular",
          canvas.width / 2,
          canvas.height / 2,
        );
        // Log error for debugging
        // eslint-disable-next-line no-console
        console.error("Specular calculation error:", error);
      }
    }, [args.width, args.height, args.radius, args.specularAngle]);

    return (
      <div
        style={{
          textAlign: "center",
          backgroundColor: "#000",
          padding: 70,
        }}
      >
        <canvas ref={canvasRef} style={{ maxWidth: "100%", height: "auto" }} />
      </div>
    );
  },
};
