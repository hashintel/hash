import type { Meta, StoryObj } from "@storybook/react";

import type { CompositeMode } from "../src/components/filter-shell";
import { convex } from "../src/helpers/surface-equations";
import { refractive } from "../src/hoc/refractive";
import { ExampleArticle } from "./example-article";

type Props = {
  compositing: CompositeMode;
};

const GlassOverArticle = ({ compositing }: Props) => (
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
        radius: 20,
        edgeSize: 30,
        thickness: 70,
        refractiveIndex: 1.5,
        edgeProfile: convex,
        compositing,
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
    compositing: {
      control: { type: "inline-radio" as const },
      options: ["image", "parts"],
    },
  },
  args: {
    compositing: "image",
  },
} satisfies Meta<typeof GlassOverArticle>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
