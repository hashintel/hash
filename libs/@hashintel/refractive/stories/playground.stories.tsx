import type { Meta, StoryObj } from "@storybook/react";

import type { CompositeMode } from "../src/components/filter-shell";
import { convex } from "../src/helpers/surface-equations";
import { refractive } from "../src/hoc/refractive";
import { ExampleArticle } from "./example-article";

type Props = {
  radius: number;
  compositing: CompositeMode;
  lightAngle: number | undefined;
  diffuseIntensity: number;
  specular: boolean;
  shadowOpacity: number;
};

const GlassOverArticle = ({
  radius,
  compositing,
  lightAngle,
  diffuseIntensity,
  specular,
  shadowOpacity,
}: Props) => (
  <div style={{ position: "relative" }}>
    <refractive.div
      style={{
        position: "sticky",
        top: 100,
        marginLeft: 50,
        width: 300,
        height: 200,
        resize: "both",
        overflow: "auto",
        // backgroundColor: "rgba(255, 255, 255, 0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1,
        boxShadow: `0 8px 24px rgba(0, 0, 0, ${shadowOpacity})`,
      }}
      refraction={{
        blur: 2,
        radius,
        edgeSize: 30,
        thickness: 70,
        refractiveIndex: 1.5,
        edgeProfile: convex,
        compositing,
        lightAngle,
        diffuseIntensity,
        specular,
      }}
    >
      Refractive Glass
    </refractive.div>

    <ExampleArticle />
  </div>
);

const meta = {
  title: "Playground",
  component: GlassOverArticle,
  argTypes: {
    radius: {
      control: { type: "range", min: 0, max: 100, step: 1 },
    },
    compositing: {
      control: { type: "inline-radio" as const },
      options: ["image", "parts"],
    },
    lightAngle: {
      control: { type: "range", min: 0, max: 6.28, step: 0.01 },
    },
    diffuseIntensity: {
      control: { type: "range", min: 0, max: 1, step: 0.01 },
    },
    specular: {
      control: { type: "boolean" },
    },
    shadowOpacity: {
      control: { type: "range", min: 0, max: 1, step: 0.01 },
    },
  },
  args: {
    radius: 20,
    compositing: "image",
    lightAngle: Math.PI / 4,
    diffuseIntensity: 0.3,
    specular: true,
    shadowOpacity: 0.15,
  },
} satisfies Meta<typeof GlassOverArticle>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NoLighting: Story = {
  args: { lightAngle: undefined, diffuseIntensity: 0 },
};
