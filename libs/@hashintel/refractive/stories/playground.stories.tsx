import type { Meta, StoryObj } from "@storybook/react";

import { CONVEX } from "../src/helpers/surface-equations";
import { refractive } from "../src/hoc/refractive";
import { ExampleArticle } from "./example-article";

const refraction = {
  blur: 2,
  radius: 20,
  specularOpacity: 0.9,
  bezelWidth: 30,
  glassThickness: 70,
  refractiveIndex: 1.5,
  bezelHeightFn: CONVEX,
  specularAngle: 2,
};

const GlassOverArticle = () => (
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
      refraction={refraction}
    >
      Refractive Glass
    </refractive.div>

    <ExampleArticle />
  </div>
);

const meta = {
  title: "Playground",
  component: GlassOverArticle,
} satisfies Meta<typeof GlassOverArticle>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
