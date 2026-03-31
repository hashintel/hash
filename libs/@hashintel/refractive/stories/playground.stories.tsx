import type { Meta, StoryObj } from "@storybook/react";

import type { CompositeMode } from "../src/components/filter-shell";
import { convex } from "../src/helpers/surface-equations";
import { refractive } from "../src/hoc/refractive";
import { ExampleArticle } from "./example-article";

type Props = {
  radius: number;
  compositing: CompositeMode;
  specularRimAngle: number | undefined;
};

const GlassOverArticle = ({ radius, compositing, specularRimAngle }: Props) => (
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
        backgroundColor: "rgba(255, 255, 255, 0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1,
      }}
      refraction={{
        blur: 2,
        radius,
        edgeSize: 30,
        thickness: 70,
        refractiveIndex: 1.5,
        edgeProfile: convex,
        compositing,
        specularRimAngle,
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
    specularRimAngle: {
      control: { type: "range", min: 0, max: 6.28, step: 0.01 },
    },
  },
  args: {
    radius: 20,
    compositing: "image",
    specularRimAngle: Math.PI / 4,
  },
} satisfies Meta<typeof GlassOverArticle>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NoSpecular: Story = {
  args: { specularRimAngle: undefined },
};
